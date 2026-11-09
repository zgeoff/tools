import { isTextEntry } from '../ci/is-text-entry.ts';

export function collectRepoSyncPermissionFaults(stubText: string, workflowText: string): string[] {
  const stub: unknown = Bun.YAML.parse(stubText);
  const workflow: unknown = Bun.YAML.parse(workflowText);
  const jobs = toRecord(findField(workflow, 'jobs'));

  return [...collectWithheldFaults(stub, jobs), ...collectAlarmFaults(jobs)];
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function findField(value: unknown, key: string): unknown {
  return toRecord(value)[key];
}

// A called workflow's job gets only the token permissions its caller grants, and GitHub fails the
// whole run at startup when a job asks for more.
function collectWithheldFaults(stub: unknown, jobs: Record<string, unknown>): string[] {
  const stubJob = findField(findField(stub, 'jobs'), 'sync');
  const granted = toPermissionMap(findField(stubJob, 'permissions'));

  return Object.entries(jobs).flatMap(([jobName, job]) => {
    const asked = Object.entries(toPermissionMap(findField(job, 'permissions')));

    return asked
      .filter(([scope, level]) => !isGranted(granted[scope], level))
      .map(
        ([scope, level]) =>
          `sync/repo-sync.yml: the ${jobName} job asks for ${scope}: ${level}, which the stub withholds`,
      );
  });
}

function toPermissionMap(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(toRecord(value)).filter((entry) => isTextEntry(entry)));
}

function isGranted(grant: string | undefined, level: string): boolean {
  return level === 'none' || grant === 'write' || (grant === 'read' && level === 'read');
}

// gh reads each check's workflow run, which a private repo hides from a token without it.
function collectAlarmFaults(jobs: Record<string, unknown>): string[] {
  const alarmPermissions = toPermissionMap(findField(findField(jobs, 'alarm'), 'permissions'));

  return isGranted(alarmPermissions['actions'], 'read')
    ? []
    : [
        '.github/workflows/repo-sync.yml: the alarm job must ask for actions: read, or it cannot read the checks of a private repo',
      ];
}
