// lefthook's summary marks each failed job with a boxing glove at the start of its line.
export function collectFailedHookJobs(output: string): string[] {
  return [...output.matchAll(/^🥊\s+(?<job>\S+)/gmu)].flatMap((failure) => {
    const job = failure.groups?.['job'];

    return job === undefined ? [] : [job];
  });
}
