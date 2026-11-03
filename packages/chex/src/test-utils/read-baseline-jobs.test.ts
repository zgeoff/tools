import { expect, test } from 'bun:test';
import { readBaselineJobs } from './read-baseline-jobs.ts';

test('it reads each job of the baseline with its hook', () => {
  const jobs = readBaselineJobs();

  expect(jobs).toContainEqual({ hook: 'pre-commit', name: 'typecheck', listsBranchFiles: false });
  expect(jobs).toContainEqual({ hook: 'pre-push', name: 'typecheck', listsBranchFiles: false });
});

test('it marks a job whose files command lists the files the branch changes', () => {
  const jobs = readBaselineJobs();

  expect(jobs).toContainEqual({ hook: 'pre-push', name: 'test', listsBranchFiles: true });
  expect(jobs).toContainEqual({ hook: 'pre-push', name: 'commits', listsBranchFiles: false });
});
