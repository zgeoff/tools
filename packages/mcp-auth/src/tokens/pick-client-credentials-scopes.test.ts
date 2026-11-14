import { expect, test } from 'bun:test';
import { pickClientCredentialsScopes } from './pick-client-credentials-scopes.ts';

test.each([
  ['no scope', null, ['read', 'write']],
  ['an empty scope', '  ', ['read', 'write']],
  ['a subset', 'write', ['write']],
  ['a repeated scope', 'read read', ['read']],
])('#pickClientCredentialsScopes gives %s', (_title, requested, expected) => {
  expect(pickClientCredentialsScopes(requested, ['read', 'write'])).toStrictEqual(expected);
});

test('#pickClientCredentialsScopes returns null for a superset', () => {
  expect(pickClientCredentialsScopes('read admin', ['read', 'write'])).toBeNull();
});
