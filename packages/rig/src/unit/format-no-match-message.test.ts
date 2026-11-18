import { expect, test } from 'bun:test';
import { formatNoMatchMessage } from './format-no-match-message.ts';

test('it names the lane and every path that selected none of its files', () => {
  expect(formatNoMatchMessage('kiln', ['./pkg/src/fire.test.ts', 'glaze'])).toBe(
    'rig: the kiln lane has no tests that match ./pkg/src/fire.test.ts glaze\n',
  );
});
