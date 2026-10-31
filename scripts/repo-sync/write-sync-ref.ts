import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';

export interface WriteSyncRefOptions {
  readonly cwd: string;

  // The whole environment of the gh command, as the step's env holds it.
  readonly env: Readonly<Record<string, string | undefined>>;

  // The commit a dispatch named; empty for any other trigger.
  readonly ref: string;

  // The commit of zgeoff/tools that the caller pins.
  readonly workflowCommit: string;

  readonly outputPath: string;
  readonly fileSystem: Pick<FileSystem, 'appendText'>;
  readonly runCommand: RunCommand;

  // Receives the step's log.
  readonly writeOutput: (text: string) => void;
}

// GitHub can drop a repository_dispatch event. A run with no ref syncs the newest green commit,
// which delivers what a lost one carried.
export async function writeSyncRef(options: Readonly<WriteSyncRefOptions>): Promise<number> {
  if (options.ref !== '') {
    await writeStepOutputs(options.fileSystem, options.outputPath, { ref: options.ref });

    return 0;
  }

  const runs = await options.runCommand(
    [
      'gh',
      'api',
      '-X',
      'GET',
      'repos/zgeoff/tools/actions/workflows/main.yml/runs',
      '-f',
      'branch=main',
      '-f',
      'event=push',
      '-f',
      'status=success',
      '-f',
      'per_page=1',
      '--jq',
      '.workflow_runs[0].head_sha // empty',
    ],
    { cwd: options.cwd, env: options.env },
  );

  const newest = runs.stdout.trim();
  const isFound = runs.exitCode === 0 && /^[0-9a-f]{40}$/u.test(newest);

  if (!isFound) {
    options.writeOutput(
      `::warning::Cannot read the newest green commit of zgeoff/tools, so the run syncs the pinned ${options.workflowCommit}: ${runs.stderr.trim()}\n`,
    );
  }

  const ref = isFound ? newest : options.workflowCommit;

  await writeStepOutputs(options.fileSystem, options.outputPath, { ref });

  return 0;
}

if (import.meta.main) {
  process.exitCode = await writeSyncRef({
    cwd: process.cwd(),
    env: process.env,
    ref: process.env['REF'] ?? '',
    workflowCommit: process.env['WORKFLOW_COMMIT'] ?? '',
    outputPath: process.env['GITHUB_OUTPUT'] ?? '',
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
