import { expect, test } from 'bun:test';
import { buildBetterAuthRequest } from './build-better-auth-request.ts';

test('it points the request at the public origin and keeps its query', () => {
  const request = new Request('http://127.0.0.1:3000/api/token?a=1', { method: 'POST' });

  const built = buildBetterAuthRequest('https://app.example', request, {
    path: '/oauth2/token',
    body: 'x=1',
  });

  expect(built.url).toBe('https://app.example/oauth2/token?a=1');
  expect(built.method).toBe('POST');
});

test('it drops the DPoP header and keeps the others', () => {
  const request = new Request('http://127.0.0.1:3000/api/token', {
    method: 'POST',
    headers: { dpop: 'proof', 'content-type': 'application/x-www-form-urlencoded' },
  });

  const built = buildBetterAuthRequest('https://app.example', request, {
    path: '/oauth2/token',
    body: 'x=1',
  });

  expect(built.headers.has('dpop')).toBeFalse();
  expect(built.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
});

test('it carries the body it is given', async () => {
  const request = new Request('http://127.0.0.1:3000/api/token', { method: 'POST' });

  const built = buildBetterAuthRequest('https://app.example', request, {
    path: '/oauth2/token',
    body: 'x=1',
  });

  const body = await built.text();

  expect(body).toBe('x=1');
});
