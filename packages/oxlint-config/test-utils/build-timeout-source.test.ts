import { expect, test } from 'bun:test';
import { buildTimeoutSource } from './build-timeout-source.ts';

test('it builds a test file whose one test carries the timeout', () => {
  expect(buildTimeoutSource(20_000)).toBe(
    "import { test } from 'bun:test';\n\ntest('it bakes', () => {}, 20000);\n",
  );
});
