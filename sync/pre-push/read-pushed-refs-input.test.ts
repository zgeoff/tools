import { expect, test } from 'bun:test';
import { readPushedRefsInput } from './read-pushed-refs-input.ts';

test('it returns the text of stdin when the arguments hold --pushed-refs', async () => {
  const input = await readPushedRefsInput(['--pushed-refs'], () =>
    Promise.resolve(
      'refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000\n',
    ),
  );

  expect(input).toBe(
    'refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000\n',
  );
});

test('it returns null without reading stdin when the arguments lack --pushed-refs', async () => {
  let reads = 0;

  const input = await readPushedRefsInput([], () => {
    reads += 1;

    return Promise.resolve('refs/heads/greeting');
  });

  expect({ input, reads }).toStrictEqual({ input: null, reads: 0 });
});

test('it throws on an argument it does not know', () => {
  expect(() => readPushedRefsInput(['--greeting'], () => Promise.resolve(''))).toThrow(
    "Unknown option '--greeting'",
  );
});
