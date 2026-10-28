import { readFile } from 'node:fs/promises';
import { collectReleaseWorkflowFaults } from './collect-release-workflow-faults.ts';

export interface ReleaseWorkflowCheckOptions {
  // Reads the text of the shared release workflow.
  readonly readWorkflow: () => Promise<string>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

const workflowPath = '.github/workflows/release-please.yml';

// Returns the exit code: 0 with no fault, 1 with faults, 2 when the workflow
// cannot be read.
export async function runReleaseWorkflowCheck(
  options: ReleaseWorkflowCheckOptions,
): Promise<number> {
  try {
    const text = await options.readWorkflow();

    const faults = collectReleaseWorkflowFaults(text);

    for (const fault of faults) {
      options.writeOutput(`${workflowPath}: ${fault}\n`);
    }

    return faults.length === 0 ? 0 : 1;
  } catch (error) {
    options.writeError(
      `release-workflow: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 2;
  }
}

async function runCLI(): Promise<void> {
  process.exitCode = await runReleaseWorkflowCheck({
    readWorkflow: () => readFile(workflowPath, 'utf8'),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

if (import.meta.main) {
  await runCLI();
}
