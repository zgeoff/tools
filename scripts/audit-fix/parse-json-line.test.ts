import { expect, test } from 'bun:test';
import { parseJSONLine } from './parse-json-line.ts';

test('it parses the last JSON line after a banner', () => {
  expect(parseJSONLine('bun audit v1.4.3\n{"fixed":1}\n')).toStrictEqual({ fixed: 1 });
});

test('it rejects output with no JSON line', () => {
  expect(() => parseJSONLine('No vulnerabilities found\n')).toThrow(
    'bun printed no JSON:\nNo vulnerabilities found\n',
  );
});
