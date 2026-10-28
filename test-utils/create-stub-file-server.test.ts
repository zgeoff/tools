import { expect, test } from 'bun:test';
import { createStubFileServer } from './create-stub-file-server.ts';

test('it answers a path with its responses in order, then repeats the last one', async () => {
  const server = createStubFileServer({
    '/kettle.txt': [
      { status: 503, body: 'busy' },
      { status: 200, body: 'boiled' },
    ],
  });

  const answers = [];

  for (let call = 0; call < 3; call += 1) {
    const response = await fetch(`${server.url}/kettle.txt`);

    answers.push({ status: response.status, body: await response.text() });
  }

  expect(answers).toStrictEqual([
    { status: 503, body: 'busy' },
    { status: 200, body: 'boiled' },
    { status: 200, body: 'boiled' },
  ]);
});

test('it answers 404 for a path it does not list and records every request', async () => {
  const server = createStubFileServer({ '/kettle.txt': [{ status: 200, body: 'boiled' }] });

  const missing = await fetch(`${server.url}/teapot.txt`);
  const found = await fetch(`${server.url}/kettle.txt`);

  expect({ missing: missing.status, found: found.status }).toStrictEqual({
    missing: 404,
    found: 200,
  });

  expect(server.requests).toStrictEqual(['/teapot.txt', '/kettle.txt']);
});

test('it serves a byte body unchanged', async () => {
  const bytes = new Uint8Array([0, 255, 31, 139]);

  const server = createStubFileServer({ '/archive.tar.gz': [{ status: 200, body: bytes }] });

  const response = await fetch(`${server.url}/archive.tar.gz`);
  const body = await response.bytes();

  expect(body).toStrictEqual(bytes);
});
