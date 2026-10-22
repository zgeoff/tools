import { expect, test } from 'bun:test';
import { pickRecordStep } from './pick-record-step.ts';

test('it skips a Bash command with no record', () => {
  expect(pickRecordStep(null)).toStrictEqual({ kind: 'skip' });
});

test('it reports the git error of a failed record', () => {
  expect(pickRecordStep({ kind: 'failed', error: 'fatal: bad index file' })).toStrictEqual({
    kind: 'report',
    error: 'fatal: bad index file',
  });
});

test('it compares a recorded snapshot', () => {
  expect(
    pickRecordStep({ kind: 'recorded', head: 'c0ffee', hashes: { 'src/a.test.ts': 'a1' } }),
  ).toStrictEqual({
    kind: 'compare',
    recorded: { kind: 'recorded', head: 'c0ffee', hashes: { 'src/a.test.ts': 'a1' } },
  });
});
