import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isRecord } from '@zgeoff/std';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

export interface BaselineJobRun {
  readonly exitCode: number;

  // The job's stdout and stderr together, as lefthook prints them.
  readonly output: string;
}

export interface BaselineJob {
  readonly hook: 'pre-commit' | 'pre-push';

  readonly name: string;

  // The files lefthook substitutes for {files} in the job's run script.
  readonly files: readonly string[];
}

// Runs one job of chex's lefthook.yml as lefthook runs it: its run script under sh, with {files}
// replaced by the quoted file list, in the repo folder.
export async function runBaselineJob(
  repo: string,
  job: BaselineJob,
  env: Readonly<Record<string, string | undefined>>,
): Promise<BaselineJobRun> {
  const configText = await readFile(join(import.meta.dir, '../lefthook.yml'), 'utf8');

  const script = buildJobScript(configText, job);

  const result = await $`/bin/sh -c ${script}`
    .cwd(repo)
    .env({ ...env })
    .nothrow()
    .quiet();

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

function buildJobScript(configText: string, job: BaselineJob): string {
  const config: unknown = Bun.YAML.parse(configText);
  const hook = isRecord(config) ? config[job.hook] : undefined;
  const jobs = isRecord(hook) && Array.isArray(hook['jobs']) ? hook['jobs'] : [];

  const found: unknown = jobs.find(
    (entry: unknown) => isRecord(entry) && entry['name'] === job.name,
  );

  const run = isRecord(found) ? found['run'] : undefined;

  invariant(typeof run === 'string', `lefthook.yml has no ${job.hook} job named ${job.name}`);

  const files = job.files.map((file) => `'${file.replaceAll("'", String.raw`'\''`)}'`).join(' ');

  return run.replaceAll('{files}', files);
}
