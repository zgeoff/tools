import { expect, test } from 'bun:test';
import { ProcessGroupStillRunningError } from './process-group-still-running-error.ts';
import { ProcessGroupStopError } from './process-group-stop-error.ts';
import { shouldKeepRunFolders } from './should-keep-run-folders.ts';

test('it keeps the folders when a process group outlives SIGKILL', () => {
  expect(shouldKeepRunFolders(new ProcessGroupStillRunningError(4417))).toBeTrue();
});

test('it keeps the folders when a signal to the group fails', () => {
  const denied = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });

  const failure = new ProcessGroupStopError(
    4417,
    'the browser lane could not stop the process group 4417',
    {
      cause: denied,
    },
  );

  expect(shouldKeepRunFolders(failure)).toBeTrue();
});

test('it removes the folders after any other failure', () => {
  expect(
    shouldKeepRunFolders(new Error('the browser lane could not create its folders')),
  ).toBeFalse();
});
