import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectReleaseWorkflowFaults } from './collect-release-workflow-faults.ts';

export async function runReleaseWorkflowCheck(cwd: string): Promise<string[]> {
  const text = await readFile(join(cwd, '.github', 'workflows', 'main.yml'), 'utf8');

  return collectReleaseWorkflowFaults(text);
}

async function runCLI(): Promise<void> {
  try {
    const faults = await runReleaseWorkflowCheck(process.cwd());

    for (const fault of faults) {
      process.stdout.write(`.github/workflows/main.yml: ${fault}\n`);
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
