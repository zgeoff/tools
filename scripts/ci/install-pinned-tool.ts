import { appendFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

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

export type ToolName = keyof typeof toolPins;

export interface ToolInstall {
  readonly name: ToolName;

  readonly pin: ToolPin;

  readonly runnerTemp: string;

  readonly githubPath: string;

  readonly env: Readonly<Record<string, string | undefined>>;
}

interface Unpack {
  readonly install: Readonly<ToolInstall>;

  readonly download: string;

  readonly folder: string;
}

// A table typed over every packaging, so a new one fails the type check until it has an unpacker.
const unpackers: Record<ToolPin['packaging'], (unpack: Unpack) => Promise<unknown>> = {
  binary: (unpack) =>
    $`install -m 0755 ${unpack.download} ${join(unpack.folder, unpack.install.name)}`
      .env({ ...unpack.install.env })
      .quiet(),
  'tar.gz': (unpack) =>
    $`tar -xzf ${unpack.download} -C ${unpack.folder} ${unpack.install.name}`
      .env({ ...unpack.install.env })
      .quiet(),
};

// Installs the tool into a folder the runner owns and puts the folder on the PATH of the job's
// later steps. A download whose checksum differs from the pin installs nothing.
export async function installPinnedTool(install: Readonly<ToolInstall>): Promise<void> {
  const download = join(install.runnerTemp, `${install.name}.download`);
  const folder = join(install.runnerTemp, `${install.name}-bin`);

  await $`curl -fsSL --retry 3 --retry-all-errors -o ${download} ${install.pin.url}`
    .env({ ...install.env })
    .quiet();

  const bytes = await Bun.file(download).bytes();

  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

  if (sha256 !== install.pin.sha256) {
    await rm(download);

    throw new Error(
      `${install.name}: the download's sha256 is ${sha256}, not the pinned ${install.pin.sha256}`,
    );
  }

  await mkdir(folder, { recursive: true });

  await unpackers[install.pin.packaging]({ install, download, folder });

  await appendFile(install.githubPath, `${folder}\n`);
}

// The static job and the private checks job run the checks that need the tools. A test job needs
// one only when its caller asks, for a suite whose tests run it.
export function shouldInstallTool(part: string, requested: string): boolean {
  return requested === 'true' || part === 'static' || part === 'all';
}

function isToolName(value: string): value is ToolName {
  return Object.hasOwn(toolPins, value);
}

async function runCLI(): Promise<void> {
  const name = process.argv[2] ?? '';

  if (!isToolName(name)) {
    process.stderr.write(`usage: install-pinned-tool.ts <${Object.keys(toolPins).join('|')}>\n`);

    process.exitCode = 2;

    return;
  }

  const pin = toolPins[name];
  const runnerTemp = process.env['RUNNER_TEMP'] ?? '';
  const githubPath = process.env['GITHUB_PATH'] ?? '';

  if (!shouldInstallTool(process.env['PART'] ?? '', process.env['SETUP_TOOL'] ?? '')) {
    process.stdout.write(`${name}: not needed, because this job runs no ${pin.neededBy}\n`);

    return;
  }

  if (runnerTemp === '' || githubPath === '') {
    process.stdout.write(`::error::${name}: the install needs RUNNER_TEMP and GITHUB_PATH\n`);

    process.exitCode = 1;

    return;
  }

  await installPinnedTool({ name, pin, runnerTemp, githubPath, env: process.env });
}

if (import.meta.main) {
  await runCLI();
}
