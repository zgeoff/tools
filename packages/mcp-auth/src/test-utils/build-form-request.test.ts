import { expect, test } from 'bun:test';
import { buildFormRequest } from './build-form-request.ts';

test('it builds a form post with the fields as the body', async () => {
  const request = buildFormRequest(
    'https://app.example/login',
    new URLSearchParams({ field: '1' }),
  );

  const body = await request.text();

  expect(request.method).toBe('POST');
  expect(request.headers.get('content-type')).toStartWith('application/x-www-form-urlencoded');
  expect(body).toBe('field=1');
});

test('it adds the headers it is given', () => {
  const request = buildFormRequest('https://app.example/login', new URLSearchParams(), {
    origin: 'https://app.example',
  });

  expect(request.headers.get('origin')).toBe('https://app.example');
});
