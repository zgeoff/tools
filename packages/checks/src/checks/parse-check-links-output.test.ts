import { expect, test } from 'bun:test';
import { parseCheckLinksOutput } from './parse-check-links-output.ts';

test('it reads a clean run as no findings', () => {
  expect(
    parseCheckLinksOutput({
      exitCode: 0,
      stdout: 'check-links: 3 files, every relative link resolves\n',
      stderr: '',
    }),
  ).toStrictEqual([]);
});

test('it reports each broken link at its path and line', () => {
  const stderr = [
    'README.md:3: (docs/guide.md) docs/guide.md does not exist',
    'docs/setup.md:12: (../README.md#install) README.md has no heading #install',
    '',
  ].join('\n');

  expect(parseCheckLinksOutput({ exitCode: 1, stdout: '', stderr })).toStrictEqual([
    {
      path: 'README.md',
      line: 3,
      message: 'check-links: (docs/guide.md) docs/guide.md does not exist',
    },
    {
      path: 'docs/setup.md',
      line: 12,
      message: 'check-links: (../README.md#install) README.md has no heading #install',
    },
  ]);
});

test('it throws with the reason when perl dies on a file it reads', () => {
  expect(() =>
    parseCheckLinksOutput({
      exitCode: 255,
      stdout: '',
      stderr: 'check-links: cannot read docs/guide.md: Permission denied\n',
    }),
  ).toThrowWithMessage(
    Error,
    'docs: check-links failed: check-links: cannot read docs/guide.md: Permission denied',
  );
});

test('it throws when check-links fails and prints no broken link it can read', () => {
  expect(() =>
    parseCheckLinksOutput({ exitCode: 1, stdout: '', stderr: 'something went wrong\n' }),
  ).toThrowWithMessage(
    Error,
    'docs: check-links failed, and it printed no broken link the check can read:\nsomething went wrong',
  );
});
