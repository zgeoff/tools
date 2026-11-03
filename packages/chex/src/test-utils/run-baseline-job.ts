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

  // The job's run script by default, or the files command that lists the job's files.
  readonly part?: 'run' | 'files';
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

  invariant(isRecord(found), `lefthook.yml has no ${job.hook} job named ${job.name}`);

  const part = job.part ?? 'run';
  const command = found[part];

  invariant(
    typeof command === 'string',
    `lefthook.yml has no ${part} command in the ${job.hook} job named ${job.name}`,
  );

  if (part === 'files') {
    return command;
  }

  // lefthook expands a template in a run script only.
  const templates = isRecord(config) && isRecord(config['templates']) ? config['templates'] : {};

  const script = Object.entries(templates).reduce(
    (text, [name, value]) =>
      typeof value === 'string' ? text.replaceAll(`{${name}}`, value) : text,
    command,
  );

  const files = job.files.map((file) => `'${file.replaceAll("'", String.raw`'\''`)}'`).join(' ');

  return script.replaceAll('{files}', files);
}
