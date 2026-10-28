import type { FileSystem } from './file-system.ts';
import { installPinnedTool } from './install-pinned-tool.ts';
import { nodeFileSystem } from './node-file-system.ts';
import type { ToolArgs } from './parse-tool-args.ts';
import { parseToolArgs } from './parse-tool-args.ts';
import type { RunCommand } from './run-command.ts';
import { runCommand } from './run-command.ts';
import { shouldInstallTool } from './should-install-tool.ts';
import type { ToolPin } from './tool-pins.ts';
import { toolPins } from './tool-pins.ts';

export interface PinnedToolStep {
  readonly args: readonly string[];

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly pins: Readonly<Record<string, ToolPin>>;

  readonly fileSystem: Pick<
    FileSystem,
    'appendText' | 'createDirectory' | 'readBytes' | 'removePath'
  >;

  readonly runCommand: RunCommand;
}

export interface StepResult {
  readonly exitCode: number;

  readonly output: string;
}

// The step reads the tool from its one argument, and PART, SETUP_TOOL, RUNNER_TEMP and GITHUB_PATH
// from its env.
export function runPinnedToolStep(step: Readonly<PinnedToolStep>): Promise<StepResult> {
  return runToolArgs(parseToolArgs(step.args, Object.keys(step.pins)), step);
}

type ToolArgsOf<Kind extends ToolArgs['kind']> = Extract<ToolArgs, { readonly kind: Kind }>;

type ToolArgsRunner<Kind extends ToolArgs['kind']> = (
  args: ToolArgsOf<Kind>,
  step: Readonly<PinnedToolStep>,
) => Promise<StepResult>;

// A table typed over every outcome of the argument parse, so a new one fails the type check until
// it has a runner.
const toolArgsRunners: { readonly [Kind in ToolArgs['kind']]: ToolArgsRunner<Kind> } = {
  refused: (args) => Promise.resolve({ exitCode: 2, output: `${args.message}\n` }),
  parsed: (args, step) => runToolInstall(args.name, step),
};

function runToolArgs<Kind extends ToolArgs['kind']>(
  args: ToolArgsOf<Kind>,
  step: Readonly<PinnedToolStep>,
): Promise<StepResult> {
  const runArgs: ToolArgsRunner<Kind> = toolArgsRunners[args.kind];

  return runArgs(args, step);
}

async function runToolInstall(name: string, step: Readonly<PinnedToolStep>): Promise<StepResult> {
  const pin = step.pins[name];

  if (pin === undefined) {
    throw new Error(`${name}: the argument parse accepted a tool with no pin`);
  }

  if (!shouldInstallTool(step.env['PART'] ?? '', step.env['SETUP_TOOL'] ?? '')) {
    return {
      exitCode: 0,
      output: `${name}: not needed, because this job runs no ${pin.neededBy}\n`,
    };
  }

  const runnerTemp = step.env['RUNNER_TEMP'] ?? '';
  const githubPath = step.env['GITHUB_PATH'] ?? '';

  if (runnerTemp === '' || githubPath === '') {
    return {
      exitCode: 1,
      output: `::error::${name}: the install needs RUNNER_TEMP and GITHUB_PATH\n`,
    };
  }

  await installPinnedTool({
    name,
    pin,
    runnerTemp,
    githubPath,
    env: step.env,
    fileSystem: step.fileSystem,
    runCommand: step.runCommand,
  });

  return { exitCode: 0, output: '' };
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
