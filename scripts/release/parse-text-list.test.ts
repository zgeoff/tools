import { expect, test } from 'bun:test';
import { parseTextList } from './parse-text-list.ts';

test('it returns the values of a JSON list of text', () => {
  const values = parseTextList('["packages/std","packages/tsconfig"]');

  expect(values).toStrictEqual(['packages/std', 'packages/tsconfig']);
});

test.each([
  ['text that is not JSON', 'packages/std'],
  ['a JSON object', '{"path":"packages/std"}'],
  ['a value that is not text', '["packages/std",1]'],
])('it returns null for %s', (_label, text) => {
  const values = parseTextList(text);

  expect(values).toBeNull();
});
