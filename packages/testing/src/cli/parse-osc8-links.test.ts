import { expect, test } from 'bun:test';
import { parseOSC8Links } from './parse-osc8-links.ts';

test('it reads a link closed by BEL', () => {
  const raw = 'see \u001B]8;;https://example.com/docs\u0007the docs\u001B]8;;\u0007 now';

  expect(parseOSC8Links(raw)).toStrictEqual([
    { text: 'the docs', href: 'https://example.com/docs', params: '' },
  ]);
});

test('it reads a link closed by the string terminator, with params', () => {
  const raw = '\u001B]8;id=7;https://example.com\u001B\\home\u001B]8;;\u001B\\';

  expect(parseOSC8Links(raw)).toStrictEqual([
    { text: 'home', href: 'https://example.com', params: 'id=7' },
  ]);
});

test('it reads every link in order and strips colour from the text', () => {
  const raw =
    '\u001B]8;;https://a.test\u0007\u001B[34mA\u001B[0m\u001B]8;;\u0007 \u001B]8;;https://b.test\u0007B\u001B]8;;\u0007';

  expect(parseOSC8Links(raw)).toStrictEqual([
    { text: 'A', href: 'https://a.test', params: '' },
    { text: 'B', href: 'https://b.test', params: '' },
  ]);
});

test('it reads no link from a link that never closes', () => {
  expect(parseOSC8Links('\u001B]8;;https://a.test\u0007dangling')).toStrictEqual([]);
});

test('it reads no link from plain text', () => {
  expect(parseOSC8Links('nothing here')).toStrictEqual([]);
});
