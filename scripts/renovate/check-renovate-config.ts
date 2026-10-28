import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

// The validator runs at the Renovate version the scheduled run pins, so it reads the preset as
// that run does.
export function parseRenovateVersion(workflowText: string): string {
  const workflow: unknown = Bun.YAML.parse(workflowText);
  const steps = collectJobSteps(workflow, 'renovate');

  const versions = steps.flatMap((step) => {
    if (typeof step !== 'object' || step === null || !('with' in step)) {
      return [];
    }

    const inputs = step.with;

    const version =
      typeof inputs === 'object' && inputs !== null && 'renovate-version' in inputs
        ? inputs['renovate-version']
        : undefined;

    return typeof version === 'string' ? [version] : [];
  });

  const [version] = versions;

  if (version === undefined || versions.length > 1) {
    throw new Error(
      `the renovate job holds ${versions.length} renovate-version inputs; the check reads exactly one`,
    );
  }

  return version;
}

function collectJobSteps(workflow: unknown, jobID: string): unknown[] {
  if (typeof workflow !== 'object' || workflow === null || !('jobs' in workflow)) {
    return [];
  }

  const jobs = workflow.jobs;

  const job =
    typeof jobs === 'object' && jobs !== null && jobID in jobs
      ? Reflect.get(jobs, jobID)
      : undefined;

  const steps = typeof job === 'object' && job !== null && 'steps' in job ? job.steps : undefined;

  return Array.isArray(steps) ? steps : [];
}

export async function runRenovateConfigCheck(cwd: string): Promise<number> {
  const workflowText = await readFile(join(cwd, '.github/workflows/renovate.yml'), 'utf8');

  const version = parseRenovateVersion(workflowText);

  const result =
    await $`npx --yes --package ${`renovate@${version}`} -- renovate-config-validator --strict --no-global default.json`
      .cwd(cwd)
      .nothrow();

  return result.exitCode;
}

if (import.meta.main) {
  process.exitCode = await runRenovateConfigCheck(process.cwd());
}
