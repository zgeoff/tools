import { expect, test } from 'bun:test';
import { collectFailedJobs } from './collect-failed-jobs.ts';

test.each([
  [
    'every job passed',
    {
      gitleaks: 'success',
      plan: 'success',
      static: 'success',
      test: 'success',
      'test-lane': 'success',
    },
    [],
  ],
  [
    'the scan and the lanes skipped by design',
    {
      gitleaks: 'skipped',
      plan: 'success',
      static: 'success',
      test: 'success',
      'test-lane': 'skipped',
    },
    [],
  ],
  [
    'the static job failed',
    {
      gitleaks: 'success',
      plan: 'success',
      static: 'failure',
      test: 'success',
      'test-lane': 'skipped',
    },
    ['static: failure'],
  ],
  [
    'the test job failed and a lane was cancelled',
    {
      gitleaks: 'success',
      plan: 'success',
      static: 'success',
      test: 'failure',
      'test-lane': 'cancelled',
    },
    ['test: failure', 'test-lane: cancelled'],
  ],
  [
    'the plan failed, so the lanes skipped',
    {
      gitleaks: 'success',
      plan: 'failure',
      static: 'success',
      test: 'success',
      'test-lane': 'skipped',
    },
    ['plan: failure'],
  ],
  [
    'the scan failed',
    {
      gitleaks: 'failure',
      plan: 'success',
      static: 'success',
      test: 'success',
      'test-lane': 'success',
    },
    ['gitleaks: failure'],
  ],
])('it reports the jobs that fail the public checks job when %s', (_label, results, expected) => {
  const needs = Object.fromEntries(
    Object.entries(results).map(([job, result]) => [job, { result, outputs: {} }]),
  );

  expect(collectFailedJobs(JSON.stringify(needs))).toStrictEqual(expected);
});

test('it refuses a needs value that holds no object of jobs', () => {
  expect(() => collectFailedJobs('null')).toThrow('NEEDS holds no object of jobs');
});
