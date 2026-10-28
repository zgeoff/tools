import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { FileSystem } from './file-system.ts';
import { nodeFileSystem } from './node-file-system.ts';
import { runCheckedCommand } from './run-checked-command.ts';
import type { RunCommand } from './run-command.ts';
import { runCommand } from './run-command.ts';

export interface ToolPin {
  readonly url: string;

  readonly sha256: string;

  // A release that ships the binary inside a tar.gz names the archive member to extract.
  readonly packaging: 'binary' | 'tar.gz';

  // The check that needs the tool, for the line a job that skips it prints.
  readonly neededBy: string;
}

const shfmtVersion = 'v3.13.1';
const actionlintVersion = '1.7.12';

export const toolPins = {
  // The shell check runs shellcheck, which the runner image carries, and shfmt, which it lacks.
  shfmt: {
    url: `https://github.com/mvdan/sh/releases/download/${shfmtVersion}/shfmt_${shfmtVersion}_linux_amd64`,
    sha256: 'fb096c5d1ac6beabbdbaa2874d025badb03ee07929f0c9ff67563ce8c75398b1',
    packaging: 'binary',
    neededBy: 'shell check',
  },
  actionlint: {
    url: `https://github.com/rhysd/actionlint/releases/download/v${actionlintVersion}/actionlint_${actionlintVersion}_linux_amd64.tar.gz`,
    sha256: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
    packaging: 'tar.gz',
    neededBy: 'workflows check',
  },
} as const satisfies Record<string, ToolPin>;

export interface PinnedToolStep {
  readonly args: readonly string[];

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly pins: Readonly<Record<string, ToolPin>>;

  readonly fileSystem: FileSystem;

  readonly runCommand: RunCommand;
}

export interface StepResult {
  readonly exitCode: number;

  readonly output: string;
}

// The step reads the tool from its one argument, and PART, SETUP_TOOL, RUNNER_TEMP and GITHUB_PATH
// from its env.
export async function runPinnedToolStep(step: Readonly<PinnedToolStep>): Promise<StepResult> {
  const parsed = parseToolArgs(step.args, Object.keys(step.pins));
  const pin = parsed.kind === 'parsed' ? step.pins[parsed.name] : undefined;

  if (parsed.kind === 'refused' || pin === undefined) {
    return { exitCode: 2, output: `${parsed.kind === 'refused' ? parsed.message : ''}\n` };
  }

  if (!shouldInstallTool(step.env['PART'] ?? '', step.env['SETUP_TOOL'] ?? '')) {
    return {
      exitCode: 0,
      output: `${parsed.name}: not needed, because this job runs no ${pin.neededBy}\n`,
    };
  }

  const runnerTemp = step.env['RUNNER_TEMP'] ?? '';
  const githubPath = step.env['GITHUB_PATH'] ?? '';

  if (runnerTemp === '' || githubPath === '') {
    return {
      exitCode: 1,
      output: `::error::${parsed.name}: the install needs RUNNER_TEMP and GITHUB_PATH\n`,
    };
  }

  await installPinnedTool({
    name: parsed.name,
    pin,
    runnerTemp,
    githubPath,
    env: step.env,
    fileSystem: step.fileSystem,
    runCommand: step.runCommand,
  });

  return { exitCode: 0, output: '' };
}

type ToolArgs =
  | { readonly kind: 'parsed'; readonly name: string }
  | { readonly kind: 'refused'; readonly message: string };

export function parseToolArgs(args: readonly string[], names: readonly string[]): ToolArgs {
  const usage = `usage: install-pinned-tool.ts <${names.join('|')}>`;

  try {
    const positionals = parseArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
      strict: true,
    }).positionals;

    const [name] = positionals;

    return positionals.length === 1 && name !== undefined && names.includes(name)
      ? { kind: 'parsed', name }
      : { kind: 'refused', message: usage };
  } catch (error) {
    return {
      kind: 'refused',
      message: `${error instanceof Error ? error.message : String(error)}\n${usage}`,
    };
  }
}

// The static job and the private checks job run the checks that need the tools. A test job needs
// one only when its caller asks, for a suite whose tests run it.
export function shouldInstallTool(part: string, requested: string): boolean {
  return requested === 'true' || part === 'static' || part === 'all';
}

export interface ToolInstall {
  readonly name: string;

  readonly pin: ToolPin;

  readonly runnerTemp: string;

  readonly githubPath: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: FileSystem;

  readonly runCommand: RunCommand;
}

// Installs the tool into a folder the runner owns and puts the folder on the PATH of the job's
// later steps. A download whose checksum differs from the pin installs nothing.
export async function installPinnedTool(install: Readonly<ToolInstall>): Promise<void> {
  const download = join(install.runnerTemp, `${install.name}.download`);
  const folder = join(install.runnerTemp, `${install.name}-bin`);
  const options = { cwd: install.runnerTemp, env: install.env };

  await runCheckedCommand(
    install.runCommand,
    ['curl', '-fsSL', '--retry', '3', '--retry-all-errors', '-o', download, install.pin.url],
    options,
  );

  const bytes = await install.fileSystem.readBytes(download);

  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

  if (sha256 !== install.pin.sha256) {
    await install.fileSystem.removePath(download);

    throw new Error(
      `${install.name}: the download's sha256 is ${sha256}, not the pinned ${install.pin.sha256}`,
    );
  }

  await install.fileSystem.createDirectory(folder);

  await runCheckedCommand(
    install.runCommand,
    buildUnpackCommand(install, download, folder),
    options,
  );

  await install.fileSystem.appendText(install.githubPath, `${folder}\n`);
}

// A table typed over every packaging, so a new one fails the type check until it has a command.
const unpackCommands: Record<
  ToolPin['packaging'],
  (name: string, download: string, folder: string) => string[]
> = {
  binary: (name, download, folder) => ['install', '-m', '0755', download, join(folder, name)],
  'tar.gz': (name, download, folder) => ['tar', '-xzf', download, '-C', folder, name],
};

function buildUnpackCommand(
  install: Readonly<ToolInstall>,
  download: string,
  folder: string,
): string[] {
  return unpackCommands[install.pin.packaging](install.name, download, folder);
}

if (import.meta.main) {
  const result = await runPinnedToolStep({
    args: process.argv.slice(2),
    env: process.env,
    pins: toolPins,
    fileSystem: nodeFileSystem,
    runCommand,
  });

  process.stdout.write(result.output);

  process.exitCode = result.exitCode;
}
