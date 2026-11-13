import { expect, test } from 'bun:test';
import { parseServiceTokenFile } from './parse-service-token-file.ts';

function setupTest() {
  const token = `svc_${'a'.repeat(32)}`;
  const otherToken = `svc_${'b'.repeat(32)}`;

  return {
    token,
    otherToken,
    parse: (clients: unknown) =>
      parseServiceTokenFile(JSON.stringify({ resource: 'https://app.example/mcp', clients }), {
        prefix: 'svc_',
        scopes: ['read', 'write'],
      }),
    parseText: (text: string) =>
      parseServiceTokenFile(text, { prefix: 'svc_', scopes: ['read', 'write'] }),
  };
}

test('it parses a file with a client, its scopes and its tokens', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    ci: { scopes: ['read', 'read'], tokens: [ctx.token, ctx.otherToken] },
  });

  expect(parsed).toStrictEqual({
    ok: true,
    file: {
      resource: 'https://app.example/mcp',
      clients: [{ name: 'ci', scopes: ['read'], tokens: [ctx.token, ctx.otherToken] }],
    },
  });
});

test('it refuses text that is not JSON', () => {
  const ctx = setupTest();

  expect(ctx.parseText('not json')).toStrictEqual({
    ok: false,
    reason: 'the file is not valid JSON',
  });
});

test.each([
  ['a file with no client', {}],
  ['a client name in capitals', { CI: { scopes: ['read'], tokens: [`svc_${'a'.repeat(32)}`] } }],
  ['a client with no scope', { ci: { scopes: [], tokens: [`svc_${'a'.repeat(32)}`] } }],
  [
    'a scope the server does not know',
    { ci: { scopes: ['admin'], tokens: [`svc_${'a'.repeat(32)}`] } },
  ],
  ['a client with no token', { ci: { scopes: ['read'], tokens: [] } }],
  [
    'a client with three tokens',
    {
      ci: {
        scopes: ['read'],
        tokens: [`svc_${'a'.repeat(32)}`, `svc_${'b'.repeat(32)}`, `svc_${'c'.repeat(32)}`],
      },
    },
  ],
  ['a token without the prefix', { ci: { scopes: ['read'], tokens: ['a'.repeat(40)] } }],
  ['a token that is too short', { ci: { scopes: ['read'], tokens: ['svc_short'] } }],
  [
    'a token that two clients share',
    {
      ci: { scopes: ['read'], tokens: [`svc_${'a'.repeat(32)}`] },
      deploy: { scopes: ['read'], tokens: [`svc_${'a'.repeat(32)}`] },
    },
  ],
  [
    'a field the file does not take',
    { ci: { scopes: ['read'], tokens: [`svc_${'a'.repeat(32)}`], extra: true } },
  ],
])('it refuses %s', (_title, clients) => {
  const ctx = setupTest();

  expect(ctx.parse(clients).ok).toBeFalse();
});

test('it never repeats a token in the reason it gives', () => {
  const ctx = setupTest();
  const secret = `wrong_${'z'.repeat(40)}`;

  const parsed = ctx.parse({
    ci: { scopes: ['read'], tokens: [secret] },
    [secret]: { scopes: ['read'] },
  });

  expect(JSON.stringify(parsed)).not.toInclude(secret);
});
