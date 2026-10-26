import { readFile } from 'node:fs/promises';
import { collectReleaseWorkflowFaults } from './collect-release-workflow-faults.ts';

export interface ReleaseWorkflowCheckOptions {
  // Reads the text of the shared release workflow.
  readonly readWorkflow: () => Promise<string>;
}

export async function runReleaseWorkflowCheck(
  options: ReleaseWorkflowCheckOptions,
): Promise<string[]> {
  const text = await options.readWorkflow();

  return collectReleaseWorkflowFaults(text);
}

async function runCLI(): Promise<void> {
  try {
    const faults = await runReleaseWorkflowCheck({
      readWorkflow: () => readFile('.github/workflows/release-please.yml', 'utf8'),
    });

    for (const fault of faults) {
      process.stdout.write(`.github/workflows/release-please.yml: ${fault}\n`);
    }

    process.exitCode = faults.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `release-workflow: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await runCLI();
}
