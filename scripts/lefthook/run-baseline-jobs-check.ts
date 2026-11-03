import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaselineJobCase } from './build-job-leak-cases.ts';
import { buildJobLeakCases } from './build-job-leak-cases.ts';
import { chexJobCases } from './chex-job-cases.ts';
import { createJobSandbox } from './create-job-sandbox.ts';

export interface BaselineJobsCheckOptions {
  readonly configText: string;

  readonly cases: readonly BaselineJobCase[];

  readonly writeOutput: (text: string) => void;
}

// Runs each case in a sandbox of its own and prints each case that fails.
export async function runBaselineJobsCheck(options: BaselineJobsCheckOptions): Promise<number> {
  let failed = 0;

  for (const jobCase of options.cases) {
    const fault = await runCase(options.configText, jobCase);

    if (fault !== null) {
      failed += 1;

      options.writeOutput(`baseline-jobs: ${jobCase.title}: ${fault}\n`);
    }
  }

  return failed === 0 ? 0 : 1;
}

async function runCase(configText: string, jobCase: BaselineJobCase): Promise<string | null> {
  await using sandbox = await createJobSandbox(configText);

  try {
    return await jobCase.check(sandbox);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function runCLI(): Promise<void> {
  const configText = await readFile(
    join(import.meta.dir, '../../packages/chex/lefthook.yml'),
    'utf8',
  );

  process.exitCode = await runBaselineJobsCheck({
    configText,
    cases: [...buildJobLeakCases(configText), ...chexJobCases],
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}

if (import.meta.main) {
  await runCLI();
}
