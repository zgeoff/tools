import { expect, test } from 'bun:test';
import { readBaselineJobs } from './read-baseline-jobs.ts';

test('it reads each job of each hook in the config', () => {
  const jobs = readBaselineJobs(
    () =>
      'pre-commit:\n  jobs:\n    - name: typecheck\n      run: tsc\npre-push:\n  jobs:\n    - name: lint\n      run: oxlint\n',
  );

  expect(jobs).toStrictEqual([
    { hook: 'pre-commit', name: 'typecheck', listsBranchFiles: false },
    { hook: 'pre-push', name: 'lint', listsBranchFiles: false },
  ]);
});

test('it marks a job whose files command lists the files the branch changes', () => {
  const jobs = readBaselineJobs(
    () =>
      'pre-push:\n  jobs:\n    - name: test\n      files: bun node_modules/@zgeoff/chex/src/read-branch-files.ts\n      run: rig related {files}\n    - name: commits\n      files: echo package.json\n      run: chex commits\n',
  );

  expect(jobs).toStrictEqual([
    { hook: 'pre-push', name: 'test', listsBranchFiles: true },
    { hook: 'pre-push', name: 'commits', listsBranchFiles: false },
  ]);
});

test('it skips a key that is no hook, a job with no name, and a hook with no job list', () => {
  const jobs = readBaselineJobs(
    () =>
      'templates:\n  quiet: exec 2>/dev/null;\npre-commit:\n  piped: true\npre-push:\n  jobs:\n    - run: oxlint\n    - name: lint\n      run: oxlint\n',
  );

  expect(jobs).toStrictEqual([{ hook: 'pre-push', name: 'lint', listsBranchFiles: false }]);
});
