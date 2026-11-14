import { expect, test } from 'bun:test';
import { parseBasicCredentials } from './parse-basic-credentials.ts';

test.each([
  ['a raw client ID', 'service:wringer-ro:svcs_abc'],
  ['a form-encoded client ID', 'service%3Awringer-ro:svcs_abc'],
])('#parseBasicCredentials reads %s', (_title, pair) => {
  expect(parseBasicCredentials(`Basic ${btoa(pair)}`)).toStrictEqual({
    clientID: 'service:wringer-ro',
    secret: 'svcs_abc',
  });
});

test('#parseBasicCredentials form-decodes a plus as a space', () => {
  expect(parseBasicCredentials(`Basic ${btoa('a+b:c%2Bd')}`)).toStrictEqual({
    clientID: 'a b',
    secret: 'c+d',
  });
});

test.each([
  ['no header', null],
  ['another scheme', 'Bearer abc'],
  ['no credentials', 'Basic'],
  ['text that is not base64', 'Basic ***'],
  ['credentials with no colon', `Basic ${btoa('service')}`],
  ['an empty client ID', `Basic ${btoa(':secret')}`],
  ['an empty secret', `Basic ${btoa('service:')}`],
  ['a malformed escape', `Basic ${btoa('a%zz:secret')}`],
])('#parseBasicCredentials returns null for %s', (_title, header) => {
  expect(parseBasicCredentials(header)).toBeNull();
});
