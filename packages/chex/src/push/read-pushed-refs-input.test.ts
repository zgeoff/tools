import { expect, mock, test } from 'bun:test';
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
  const readStdin = mock(() => Promise.resolve('refs/heads/greeting'));

  const input = await readPushedRefsInput([], readStdin);

  expect(input).toBeNull();
  expect(readStdin).not.toHaveBeenCalled();
});

test('it throws on an argument it does not know', () => {
  expect(() => readPushedRefsInput(['--greeting'], () => Promise.resolve(''))).toThrow(
    "Unknown option '--greeting'",
  );
});
