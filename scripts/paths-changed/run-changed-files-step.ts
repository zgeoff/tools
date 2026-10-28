import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { matchChangedFiles } from './match-changed-files.ts';

export interface ChangedFilesStep {
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: Pick<FileSystem, 'appendText'>;

  readonly runCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

// The step reads EVENT, PATTERNS, GITHUB_WORKSPACE and GITHUB_OUTPUT from its env, logs each match,
// and writes the answer as the changed output. Returns the step's exit code.
export async function runChangedFilesStep(step: Readonly<ChangedFilesStep>): Promise<number> {
  const outputPath = step.env['GITHUB_OUTPUT'] ?? '';
  const checkout = step.env['GITHUB_WORKSPACE'] ?? '';

  if (outputPath === '' || checkout === '') {
    step.writeOutput('::error::the match step needs GITHUB_OUTPUT and GITHUB_WORKSPACE\n');

    return 1;
  }

  const answer = await matchChangedFiles({
    checkout,
    env: step.env,
    event: step.env['EVENT'] ?? '',
    patterns: step.env['PATTERNS'] ?? '',
    runCommand: step.runCommand,
  });

  for (const line of answer.matches) {
    step.writeOutput(`${line}\n`);
  }

  step.writeOutput(`changed=${answer.changed}\n`);

  await writeStepOutputs(step.fileSystem, outputPath, { changed: String(answer.changed) });

  return 0;
}

if (import.meta.main) {
  process.exitCode = await runChangedFilesStep({
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
