import { isTextEntry } from '../ci/is-text-entry.ts';

// A called workflow's job gets only the token permissions its caller grants, and GitHub fails the
// whole run at startup when a job asks for more.
export function collectWithheldPermissions(stubText: string, workflowText: string): string[] {
  const stub: unknown = Bun.YAML.parse(stubText);
  const workflow: unknown = Bun.YAML.parse(workflowText);
  const stubJob = findField(findField(stub, 'jobs'), 'sync');
  const granted = toPermissionMap(findField(stubJob, 'permissions'));
  const jobs = Object.entries(toRecord(findField(workflow, 'jobs')));

  return jobs.flatMap(([jobName, job]) => {
    const asked = Object.entries(toPermissionMap(findField(job, 'permissions')));

    return asked
      .filter(([scope, level]) => !isGranted(granted[scope], level))
      .map(([scope, level]) => `${jobName} asks for ${scope}: ${level}, which the stub withholds`);
  });
}

function findField(value: unknown, key: string): unknown {
  return toRecord(value)[key];
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function toPermissionMap(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(toRecord(value)).filter((entry) => isTextEntry(entry)));
}

function isGranted(grant: string | undefined, level: string): boolean {
  return level === 'none' || grant === 'write' || (grant === 'read' && level === 'read');
}
