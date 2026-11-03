// A process probe that finds a process live only when the list holds its process ID.
export function buildStubProcessProbe(
  liveProcessIDs: readonly number[],
): (processID: number) => boolean {
  return (processID) => liveProcessIDs.includes(processID);
}
