import { expect, test } from 'bun:test';
import { $ } from 'bun';
import { buildTextWithBlobPrefix } from './build-text-with-blob-prefix.ts';

test.each(['00', '7f', 'e4'])(
  'it builds a text whose git blob ID starts with %s',
  async (prefix) => {
    const text = buildTextWithBlobPrefix('farewell: goodbye', prefix);

    const blob = await $`git hash-object --stdin < ${Buffer.from(text)}`.text();

    expect({ text, prefix: blob.slice(0, 2) }).toStrictEqual({
      text: expect.stringMatching(/^farewell: goodbye \d+\n$/u),
      prefix,
    });
  },
);

test('it counts a multi-byte stem in bytes, as git does', async () => {
  const text = buildTextWithBlobPrefix('adiós', 'a1');

  const blob = await $`git hash-object --stdin < ${Buffer.from(text)}`.text();

  expect(blob.slice(0, 2)).toBe('a1');
});
