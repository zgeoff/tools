import { expect, test } from 'bun:test';
import { collectCommandReads } from './collect-command-reads.ts';

test('it resolves the files that each reader in a pipeline or list opens', () => {
  expect(
    collectCommandReads(
      'cat a.md && head -n 5 /abs/b.md | less; sed -n 1,9p c.md; nl d.md; tail -20 e.md; bat f.md',
      '/repo',
    ),
  ).toStrictEqual([
    '/repo/a.md',
    '/repo/5',
    '/abs/b.md',
    '/repo/1,9p',
    '/repo/c.md',
    '/repo/d.md',
    '/repo/e.md',
    '/repo/f.md',
  ]);
});

test('it counts a file read through an input redirect', () => {
  expect(collectCommandReads('cat < notes.md', '/repo')).toStrictEqual(['/repo/notes.md']);
});

test('it counts neither a sed that rewrites nor a program that is not a reader', () => {
  expect(
    collectCommandReads('sed -i s/a/b/ a.md; grep x b.md; echo $(cat c.md)', '/repo'),
  ).toStrictEqual([]);
});
