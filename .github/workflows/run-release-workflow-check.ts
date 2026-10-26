import { readFile } from 'node:fs/promises';
import { collectReleaseWorkflowFaults } from './collect-release-workflow-faults.ts';

async function runCLI(): Promise<void> {
  try {
    const text = await readFile('.github/workflows/release-please.yml', 'utf8');

    const faults = collectReleaseWorkflowFaults(text);

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
