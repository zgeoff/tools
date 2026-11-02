import { isRecord } from '@zgeoff/std';
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

export interface BaselineJobDeps {
  readonly readConfigText: () => Promise<string>;

  readonly runScript: (
    script: string,
    repo: string,
    env: Readonly<Record<string, string | undefined>>,
  ) => Promise<BaselineJobRun>;
}

// Runs one job of chex's lefthook.yml as lefthook runs it: its run script, with {files} replaced by
// the quoted file list, in the repo folder.
export async function runBaselineJob(
  deps: BaselineJobDeps,
  repo: string,
  job: BaselineJob,
  env: Readonly<Record<string, string | undefined>>,
): Promise<BaselineJobRun> {
  const configText = await deps.readConfigText();

  return deps.runScript(buildJobScript(configText, job), repo, env);
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
