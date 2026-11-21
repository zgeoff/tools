import { expect, test } from 'bun:test';
import { readStreamUntil } from './read-stream-until.ts';

test('it returns the output as soon as it holds the text, with the stream still open', async () => {
  const transform = new TransformStream<Uint8Array, Uint8Array>();

  const writer = transform.writable.getWriter();

  const encoder = new TextEncoder();

  const output = readStreamUntil(transform.readable, 'build started');

  await writer.write(encoder.encode('$ bun build.ts\nbuild '));
  await writer.write(encoder.encode('started\n'));

  const read = await output;

  const reader = transform.readable.getReader();
  const later = reader.read();

  await writer.write(encoder.encode('build finished\n'));

  const laterChunk = await later;

  expect(read).toBe('$ bun build.ts\nbuild started\n');
  expect(laterChunk.value).toStrictEqual(encoder.encode('build finished\n'));
});

test('it returns the whole output when the stream ends without the text', async () => {
  const stream = new Response('$ bun build.ts\nerror: build failed\n').body;

  if (stream === null) {
    throw new Error('the response has no body');
  }

  const output = await readStreamUntil(stream, 'build started');

  expect(output).toBe('$ bun build.ts\nerror: build failed\n');
});
