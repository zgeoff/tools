// Throws as `process.kill` does: ESRCH for a missing process, EPERM for another user's.
export function signalHostProcess(pid: number, signal: NodeJS.Signals | number): void {
  process.kill(pid, signal);
}
