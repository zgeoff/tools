import { expect, test } from 'bun:test';
import { makeRecordingStub } from './make-recording-stub.ts';

test('it records the arguments of each call', () => {
  const reportCleanupError = makeRecordingStub();

  reportCleanupError(new Error('the disk went away'));
  reportCleanupError(new Error('the folder is busy'));

  expect(reportCleanupError.mock.calls).toStrictEqual([
    [new Error('the disk went away')],
    [new Error('the folder is busy')],
  ]);
});
