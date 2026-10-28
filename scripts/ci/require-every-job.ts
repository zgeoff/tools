// GitHub reports a job that ran and passed as success, and one that its `if:` left out as skipped.
const passingResults = new Set(['success', 'skipped']);

// Returns one line for each job in the toJSON(needs) text whose result is neither.
export function collectFailedJobs(needsText: string): string[] {
  const needs: unknown = JSON.parse(needsText);

  if (typeof needs !== 'object' || needs === null) {
    throw new Error('NEEDS holds no object of jobs');
  }

  return Object.entries(needs).flatMap(([job, value]: [string, unknown]) => {
    const result =
      typeof value === 'object' && value !== null && 'result' in value ? value.result : undefined;

    return typeof result === 'string' && passingResults.has(result)
      ? []
      : [`${job}: ${String(result)}`];
  });
}

if (import.meta.main) {
  const failed = collectFailedJobs(process.env['NEEDS'] ?? '');

  for (const line of failed) {
    process.stdout.write(`::error::${line}\n`);
  }

  if (failed.length === 0) {
    process.stdout.write('every job passed or skipped by design\n');
  }

  process.exitCode = failed.length === 0 ? 0 : 1;
}
