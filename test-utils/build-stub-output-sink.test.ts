import { expect, test } from 'bun:test';
import { buildStubOutputSink } from './build-stub-output-sink.ts';

test('it keeps the text of every chunk in order', () => {
  const sink = buildStubOutputSink();

  sink.write(new TextEncoder().encode('boil'));
  sink.write(new TextEncoder().encode('ed\n'));

  expect(sink.readText()).toBe('boiled\n');
});

test('it settles the first write once a chunk arrives, and not before', async () => {
  const sink = buildStubOutputSink();

  const before = await Promise.race([sink.firstWrite, Promise.resolve('pending')]);

  sink.write(new TextEncoder().encode('boiled\n'));

  const after = await Promise.race([sink.firstWrite, Promise.resolve('pending')]);

  expect(before).toBe('pending');
  expect(after).toBeUndefined();
});
