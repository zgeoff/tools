import { expect, test } from 'bun:test';
import { pickComparisonStep } from './pick-comparison-step.ts';

test('it skips the check outside a work tree', () => {
  expect(pickComparisonStep({ kind: 'no-work-tree' })).toStrictEqual({ kind: 'skip' });
});

test('it reports a git failure', () => {
  expect(pickComparisonStep({ kind: 'git-failed', error: 'fatal: bad index file' })).toStrictEqual({
    kind: 'report',
    error: 'fatal: bad index file',
  });
});

test('it skips the check when no gated path changed', () => {
  expect(pickComparisonStep({ kind: 'compared', changedPaths: [] })).toStrictEqual({
    kind: 'skip',
  });
});

test('it checks the skills for the changed gated paths', () => {
  expect(pickComparisonStep({ kind: 'compared', changedPaths: ['src/a.test.ts'] })).toStrictEqual({
    kind: 'gate',
    changedPaths: ['src/a.test.ts'],
  });
});
