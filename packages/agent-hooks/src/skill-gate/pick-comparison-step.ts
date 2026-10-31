import { match } from 'ts-pattern';
import type { BashComparison, BashResultStep } from './types.ts';

export function pickComparisonStep(comparison: BashComparison): BashResultStep {
  return match(comparison)
    .returnType<BashResultStep>()
    .with({ kind: 'no-work-tree' }, () => ({ kind: 'skip' }))
    .with({ kind: 'git-failed' }, (failed) => ({ kind: 'report', error: failed.error }))
    .with({ kind: 'compared' }, (compared) =>
      compared.changedPaths.length === 0
        ? { kind: 'skip' }
        : { kind: 'gate', changedPaths: compared.changedPaths },
    )
    .exhaustive();
}
