import type { Signal } from './types.ts';

// A group that has already emptied is no error: the signal had nothing left to reach.
export function signalGroup(groupID: number, signal: Signal | 0): void {
  try {
    process.kill(-groupID, signal);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
      throw error;
    }
  }
}
