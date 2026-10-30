import { match } from 'ts-pattern';
import type { BashSnapshot, RecordStep } from './types.ts';

export function pickRecordStep(record: BashSnapshot | null): RecordStep {
  // A call that began before the hook was installed has no record, and every file dirty before it
  // would otherwise count as its change.
  if (record === null) {
    return { kind: 'skip' };
  }

  return match(record)
    .returnType<RecordStep>()
    .with({ kind: 'failed' }, (failed) => ({ kind: 'report', error: failed.error }))
    .with({ kind: 'recorded' }, (recorded) => ({ kind: 'compare', recorded }))
    .exhaustive();
}
