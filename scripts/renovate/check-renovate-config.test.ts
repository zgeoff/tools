import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import type { CommandOptions } from '../ci/run-command.ts';
import { parseRenovateVersion, runRenovateConfigCheck } from './check-renovate-config.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-check-renovate-config-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the renovate-version input of the renovate job', () => {
  const workflow = [
    'jobs:',
    '  renovate:',
    '    steps:',
    '      - uses: actions/create-github-app-token@abc',
    '        with:',
    '          owner: acme',
    '      - uses: renovatebot/github-action@def',
    '        with:',
    '          renovate-version: 44.1.0',
    '',
  ].join('\n');

  expect(parseRenovateVersion(workflow)).toBe('44.1.0');
});

test('it refuses a renovate job that pins no renovate-version', () => {
  const workflow = 'jobs:\n  renovate:\n    steps:\n      - uses: renovatebot/github-action@def\n';

  expect(() => parseRenovateVersion(workflow)).toThrow(
    'the renovate job holds 0 renovate-version inputs; the check reads exactly one',
  );
});

test('it reads the version that renovate.yml pins for the scheduled run', async () => {
  const text = await readFile(
    join(import.meta.dir, '../../.github/workflows/renovate.yml'),
    'utf8',
  );

  expect(parseRenovateVersion(text)).toMatch(/^\d+\.\d+\.\d+$/u);
});

test('it validates default.json strictly at the pinned version and returns the validator exit code', async () => {
  const ctx = await setupTest();

  const calls: { argv: readonly string[]; cwd: string }[] = [];
  const output: string[] = [];

  await writeTreeFiles(ctx.directory, {
    '.github/workflows/renovate.yml':
      'jobs:\n  renovate:\n    steps:\n      - with:\n          renovate-version: 44.1.0\n',
  });

  const exitCode = await runRenovateConfigCheck({
    cwd: ctx.directory,
    env: {},
    runCommand: (argv: readonly string[], options: Readonly<CommandOptions>) => {
      calls.push({ argv, cwd: options.cwd });

      return Promise.resolve({
        exitCode: 1,
        stdout: 'ERROR: Config validation failed\n',
        stderr: '',
      });
    },
    writeOutput: (text) => {
      output.push(text);
    },
  });

  expect({ exitCode, calls, output }).toStrictEqual({
    exitCode: 1,
    calls: [
      {
        argv: [
          'npx',
          '--yes',
          '--package',
          'renovate@44.1.0',
          '--',
          'renovate-config-validator',
          '--strict',
          '--no-global',
          'default.json',
        ],
        cwd: ctx.directory,
      },
    ],
    output: ['ERROR: Config validation failed\n'],
  });
});
