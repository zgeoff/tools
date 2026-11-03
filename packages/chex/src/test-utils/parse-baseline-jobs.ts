import { isRecord } from '@zgeoff/std';

export interface BaselineJobEntry {
  readonly hook: 'pre-commit' | 'pre-push';

  readonly name: string;

  // Whether the job's files command lists the files the branch changes.
  readonly listsBranchFiles: boolean;
}

const hooks = ['pre-commit', 'pre-push'] as const;

export function parseBaselineJobs(configText: string): BaselineJobEntry[] {
  const config: unknown = Bun.YAML.parse(configText);

  return hooks.flatMap((hook) => {
    const value = isRecord(config) ? config[hook] : undefined;
    const jobs: unknown[] = isRecord(value) && Array.isArray(value['jobs']) ? value['jobs'] : [];

    return jobs.flatMap((job) => buildEntry(hook, job));
  });
}

function buildEntry(hook: BaselineJobEntry['hook'], job: unknown): BaselineJobEntry[] {
  if (!isRecord(job) || typeof job['name'] !== 'string') {
    return [];
  }

  const files = job['files'];

  return [
    {
      hook,
      name: job['name'],
      listsBranchFiles: typeof files === 'string' && files.includes('read-branch-files'),
    },
  ];
}
