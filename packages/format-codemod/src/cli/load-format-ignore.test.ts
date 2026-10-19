import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFormatIgnore } from './load-format-ignore.ts';

test('it returns an empty list when no ignore file exists', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));

  expect(loadFormatIgnore(directory)).toBeEmpty();
});

test('it reads one glob per line', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));

  fs.writeFileSync(path.join(directory, '.formatignore'), 'dist/**\nsrc/generated/**\n');

  expect(loadFormatIgnore(directory)).toStrictEqual(['dist/**', 'src/generated/**']);
});

test('it skips blank lines and comment lines', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));

  fs.writeFileSync(
    path.join(directory, '.formatignore'),
    '# build output\ndist/**\n\n  \n# codegen\nsrc/generated/**\n',
  );

  expect(loadFormatIgnore(directory)).toStrictEqual(['dist/**', 'src/generated/**']);
});

test('it trims surrounding whitespace including CRLF line endings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));

  fs.writeFileSync(path.join(directory, '.formatignore'), 'dist/**\r\n  build/**  \r\n');

  expect(loadFormatIgnore(directory)).toStrictEqual(['dist/**', 'build/**']);
});
