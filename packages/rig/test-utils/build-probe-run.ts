// A run probe that finds a run live only when the list holds its run ID.
export function buildProbeRun(liveRunIDs: readonly string[]): (runID: string) => Promise<boolean> {
  return (runID) => Promise.resolve(liveRunIDs.includes(runID));
}
