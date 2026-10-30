import { expect, test } from 'bun:test';
import { pickExitCodeAfterTests } from './pick-exit-code-after-tests.ts';

test.each([
  { run: 'tests that pass', testsExitCode: 0, isAborted: false, expected: 0 },
  { run: 'tests that fail', testsExitCode: 1, isAborted: false, expected: 1 },
  { run: 'an aborted run whose tests exit 0', testsExitCode: 0, isAborted: true, expected: 1 },
  { run: 'an aborted run whose tests exit 143', testsExitCode: 143, isAborted: true, expected: 1 },
])('it picks the exit code of $run', (row) => {
  expect(pickExitCodeAfterTests(row.testsExitCode, row.isAborted)).toBe(row.expected);
});
