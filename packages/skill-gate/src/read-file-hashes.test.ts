import { expect, test } from 'bun:test';
import { readFileHashes } from './read-file-hashes.ts';

test('it hashes each path by its content, and gives a path with no content null', async () => {
  const encoder = new TextEncoder();

  const contents = new Map([
    ['/repo/a.test.ts', encoder.encode("test('it adds', () => {});\n")],
    ['/repo/b.test.ts', encoder.encode("test('it adds', () => {});\n")],
    ['/repo/c.test.ts', encoder.encode("test('it subtracts', () => {});\n")],
  ]);

  const hashes = await readFileHashes(
    (filePath) => Promise.resolve(contents.get(filePath) ?? null),
    '/repo',
    ['a.test.ts', 'b.test.ts', 'c.test.ts', 'gone.test.ts'],
  );

  expect(hashes).toStrictEqual({
    'a.test.ts': expect.any(String),
    'b.test.ts': expect.any(String),
    'c.test.ts': expect.any(String),
    'gone.test.ts': null,
  });

  expect(hashes['b.test.ts']).toBe(hashes['a.test.ts']);
  expect(hashes['c.test.ts']).not.toBe(hashes['a.test.ts']);
});
