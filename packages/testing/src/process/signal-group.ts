import type { Signal } from './types.ts';

type Kill = (pid: number, signal: Signal | 0) => void;

// A group that has already emptied is no error: the signal had nothing left to reach. macOS fails
// with EPERM for a group whose leader has exited, so EPERM counts as gone too. `kill` stands in
// for process.kill, for this function's own tests.
export function signalGroup(
  groupID: number,
  signal: Signal | 0,
  kill: Kill = process.kill.bind(process),
): void {
  try {
    kill(-groupID, signal);
  } catch (error) {
    if (!isGoneError(error)) {
      throw error;
    }
  }
}

function isGoneError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error.code === 'ESRCH' || error.code === 'EPERM')
  );
}
