import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { pickReleaseOutputs } from './pick-release-outputs.ts';

export interface ReleaseOutputsStep {
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: Pick<FileSystem, 'appendText'>;

  readonly writeOutput: (text: string) => void;
}

// The step reads RELEASE_OUTPUTS and GITHUB_OUTPUT from its env, and writes the release job's
// outputs. Returns the step's exit code.
export async function runReleaseOutputsStep(step: Readonly<ReleaseOutputsStep>): Promise<number> {
  const outputPath = step.env['GITHUB_OUTPUT'] ?? '';
  const result = pickReleaseOutputs(step.env['RELEASE_OUTPUTS'] ?? '');

  if (outputPath === '') {
    step.writeOutput('::error::the release outputs step needs GITHUB_OUTPUT\n');

    return 1;
  }

  if (result.kind === 'invalid') {
    step.writeOutput(`::error::RELEASE_OUTPUTS: ${result.message}\n`);

    return 1;
  }

  await writeStepOutputs(step.fileSystem, outputPath, result.outputs);

  return 0;
}

if (import.meta.main) {
  process.exitCode = await runReleaseOutputsStep({
    env: process.env,
    fileSystem: nodeFileSystem,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
