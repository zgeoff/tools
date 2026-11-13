import { expect, test } from 'bun:test';
import { buildServiceTokenVerifier } from './build-service-token-verifier.ts';

function setupTest() {
  const token = `svc_${'a'.repeat(32)}`;
  const secondToken = `svc_${'b'.repeat(32)}`;

  const verifier = buildServiceTokenVerifier({
    resource: 'https://app.example/mcp',
    clients: [
      { name: 'ci', scopes: ['read'], tokens: [token, secondToken] },
      { name: 'deploy', scopes: ['read', 'write'], tokens: [`svc_${'c'.repeat(32)}`] },
    ],
  });

  return { token, secondToken, verifier };
}

test('#verify returns the access of the client that holds the token', () => {
  const ctx = setupTest();

  expect(ctx.verifier.verify(ctx.secondToken)).toStrictEqual({
    kind: 'service',
    clientID: 'service:ci',
    clientName: 'service:ci',
    scopes: ['read'],
  });
});

test.each([[''], ['svc_'], [`svc_${'a'.repeat(32)}x`], [`svc_${'a'.repeat(31)}`]])(
  '#verify returns null for the value %p',
  (value) => {
    const ctx = setupTest();

    expect(ctx.verifier.verify(value)).toBeNull();
  },
);

test('#findScopes returns the scopes of a client in the file', () => {
  const ctx = setupTest();

  expect(ctx.verifier.findScopes('service:deploy')).toStrictEqual(['read', 'write']);
});

test('#findScopes returns null for a client the file does not list', () => {
  const ctx = setupTest();

  expect(ctx.verifier.findScopes('service:other')).toBeNull();
  expect(ctx.verifier.findScopes('deploy')).toBeNull();
});
