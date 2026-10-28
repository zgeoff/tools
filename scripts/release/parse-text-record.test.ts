import { expect, test } from 'bun:test';
import { parseTextRecord } from './parse-text-record.ts';

test('it returns the entries of a JSON object of text', () => {
  const record = parseTextRecord('{"packages/std":"0.4.0","packages/tsconfig":"1.2.0"}');

  expect(record).toStrictEqual({ 'packages/std': '0.4.0', 'packages/tsconfig': '1.2.0' });
});

test.each([
  ['text that is not JSON', 'packages/std=0.4.0'],
  ['a JSON list', '["0.4.0"]'],
  ['null', 'null'],
  ['a value that is not text', '{"releases_created":true}'],
])('it returns null for %s', (_label, text) => {
  const record = parseTextRecord(text);

  expect(record).toBeNull();
});
