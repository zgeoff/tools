import { expect, test } from 'bun:test';
import { collectFailedHookJobs } from './collect-failed-hook-jobs.ts';

test('it collects the name of each job that the summary marks as failed', () => {
  const output = [
    'summary: (done in 2.10 seconds)',
    '✔️ uncommitted (0.12 seconds)',
    '🥊 lint (1.20 seconds)',
    '✔️ shell (0.30 seconds)',
    '🥊 commits (0.40 seconds)',
  ].join('\n');

  expect(collectFailedHookJobs(output)).toStrictEqual(['lint', 'commits']);
});

test('it collects no job from a summary where each job passed', () => {
  expect(collectFailedHookJobs('✔️ uncommitted (0.12 seconds)\n')).toStrictEqual([]);
});
