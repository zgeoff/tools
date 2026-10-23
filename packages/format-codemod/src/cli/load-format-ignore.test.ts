import { expect, onTestFinished, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFormatIgnore } from './load-format-ignore.ts';

function setupTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));

  onTestFinished(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory };
}

test('it returns an empty list when no ignore file exists', () => {
  const ctx = setupTest();

  expect(loadFormatIgnore(ctx.directory)).toBeEmpty();
});

test('it reads one glob per line', () => {
  const ctx = setupTest();

  fs.writeFileSync(path.join(ctx.directory, '.formatignore'), 'dist/**\nsrc/generated/**\n');

  expect(loadFormatIgnore(ctx.directory)).toStrictEqual(['dist/**', 'src/generated/**']);
});

test('it skips blank lines and comment lines', () => {
  const ctx = setupTest();

  fs.writeFileSync(
    path.join(ctx.directory, '.formatignore'),
    '# build output\ndist/**\n\n  \n# codegen\nsrc/generated/**\n',
  );

  expect(loadFormatIgnore(ctx.directory)).toStrictEqual(['dist/**', 'src/generated/**']);
});

test('it trims surrounding whitespace including CRLF line endings', () => {
  const ctx = setupTest();

  fs.writeFileSync(path.join(ctx.directory, '.formatignore'), 'dist/**\r\n  build/**  \r\n');

  expect(loadFormatIgnore(ctx.directory)).toStrictEqual(['dist/**', 'build/**']);
});
