import { expect, test } from 'bun:test';
import { buildScreen } from './build-screen.ts';

test('#getByText returns the first line that contains the string', () => {
  const screen = buildScreen(() => 'one\ntwo apples\nthree apples\n');

  expect(screen.getByText('apples')).toBe('two apples');
});

test('#getByText matches a RegExp by test, and a global RegExp twice in a row', () => {
  const screen = buildScreen(() => 'ready 42\n');
  const pattern = /ready \d+/gu;

  expect([screen.getByText(pattern), screen.getByText(pattern)]).toStrictEqual([
    'ready 42',
    'ready 42',
  ]);
});

test('#getByText throws with the screen text when no line matches', () => {
  const screen = buildScreen(() => 'one\ntwo\n');

  expect(() => screen.getByText('three')).toThrow(
    'no line on the screen matches three; the screen:\none\ntwo\n',
  );
});

test('#queryByText returns null when no line matches', () => {
  const screen = buildScreen(() => 'one\n');

  expect(screen.queryByText('two')).toBeNull();
});

test('#getAllByText returns every matching line in order', () => {
  const screen = buildScreen(() => 'a1\nb\na2\n');

  expect(screen.getAllByText(/^a/u)).toStrictEqual(['a1', 'a2']);
});

test('#text returns the collapsed screen', () => {
  const screen = buildScreen(() => 'old\rnew\n\u001B[1mbold\u001B[0m\n');

  expect(screen.text()).toBe('new\nbold\n');
});

test('#links returns the hyperlinks in the output', () => {
  const screen = buildScreen(() => '\u001B]8;;https://example.com\u0007site\u001B]8;;\u0007');

  expect(screen.links()).toStrictEqual([{ text: 'site', href: 'https://example.com', params: '' }]);
});

test('#findByText waits for a line that shows up later', async () => {
  let output = 'start\n';
  const screen = buildScreen(() => output);

  setTimeout(() => {
    output += 'later\n';
  }, 60);

  const actual = await screen.findByText('later');

  expect(actual).toBe('later');
});

test('#findByText throws with the screen text when the wait runs out', () => {
  const screen = buildScreen(() => 'only line\n');

  expect(screen.findByText('missing', { timeoutMs: 50 })).rejects.toThrow(
    'no line on the screen matches missing; the screen:\nonly line\n',
  );
});
