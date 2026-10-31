import { match } from 'ts-pattern';

export type StopPhase = 'before-stop' | 'after-sigterm' | 'after-sigkill';

export interface StopObservation {
  readonly phase: StopPhase;

  readonly isGroupRunning: boolean;

  readonly isPastDeadline: boolean;
}

export type StopStep =
  | { readonly kind: 'done' }
  | { readonly kind: 'signal'; readonly signal: 'SIGTERM' | 'SIGKILL' }
  | { readonly kind: 'wait' }
  | { readonly kind: 'fail' };

// A process can ignore SIGTERM, so the group gets SIGKILL once the deadline after SIGTERM passes.
export function pickStopStep(observation: StopObservation): StopStep {
  return match<StopObservation, StopStep>(observation)
    .with({ isGroupRunning: false }, () => ({ kind: 'done' }))
    .with({ phase: 'before-stop' }, () => ({ kind: 'signal', signal: 'SIGTERM' }))
    .with({ isPastDeadline: false }, () => ({ kind: 'wait' }))
    .with({ phase: 'after-sigterm' }, () => ({ kind: 'signal', signal: 'SIGKILL' }))
    .with({ phase: 'after-sigkill' }, () => ({ kind: 'fail' }))
    .exhaustive();
}
