export type LockStep = 'acquired' | 'wait' | 'give-up';

export interface LockAttempt {
  readonly isLocked: boolean;

  readonly nowMs: number;

  readonly deadlineMs: number;
}

export function pickLockStep(attempt: LockAttempt): LockStep {
  if (attempt.isLocked) {
    return 'acquired';
  }

  // A holder that hangs never frees the lock, so the wait gives up once the deadline passes.
  return attempt.nowMs >= attempt.deadlineMs ? 'give-up' : 'wait';
}
