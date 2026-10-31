import { expect, test } from 'bun:test';
import { formatNoTestsMessage } from './format-no-tests-message.ts';

test('it names the lane that has no tests', () => {
  expect(formatNoTestsMessage('docker')).toBe('rig: the docker lane has no tests\n');
});
