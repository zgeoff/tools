import { match } from 'ts-pattern';
import type { BashSnapshot, RecordStep } from './types.ts';

// Picks what follows the record of a Bash command. A call with no record, such as one that began
// before the hook was installed, goes unchecked: every file dirty before it would otherwise count
// as its change.
export function pickRecordStep(record: BashSnapshot | null): RecordStep {
  if (record === null) {
    return { kind: 'skip' };
  }

  return match(record)
    .returnType<RecordStep>()
    .with({ kind: 'failed' }, (failed) => ({ kind: 'report', error: failed.error }))
    .with({ kind: 'recorded' }, (recorded) => ({ kind: 'compare', recorded }))
    .exhaustive();
}
