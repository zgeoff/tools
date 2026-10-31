import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { firstPartyScopes } from '../../packages/chex/src/dependency-gates/first-party-scopes.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { CommandOptions, CommandResult } from '../ci/run-command.ts';
import { runRenovateConfigCheck } from './run-renovate-config-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-renovate-config-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const calls: { argv: readonly string[]; cwd: string }[] = [];
  const errors: string[] = [];

  // Runs the check; the validator, if it runs, answers with the given result.
  const runCheck = (validatorResult: Readonly<CommandResult>) =>
    runRenovateConfigCheck({
      cwd: directory,
      env: {},
      fileSystem: nodeFileSystem,
      runLoggedCommand: (argv: readonly string[], options: Readonly<CommandOptions>) => {
        calls.push({ argv, cwd: options.cwd });

        return Promise.resolve(validatorResult);
      },
      writeError: (text) => {
        errors.push(text);
      },
    });

  return { directory, calls, errors, runCheck };
}

test('it validates default.json strictly at the pinned version and returns the validator exit code', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'default.json': JSON.stringify({
      packageRules: [
        {
          matchPackageNames: firstPartyScopes.map((scope) => `${scope}**`),
          minimumReleaseAge: null,
        },
      ],
    }),
  });

  await writeTreeFiles(ctx.directory, {
    '.github/workflows/renovate.yml':
      'jobs:\n  renovate:\n    steps:\n      - with:\n          renovate-version: 44.1.0\n',
  });

  const exitCode = await ctx.runCheck({
    exitCode: 1,
    stdout: 'ERROR: Config validation failed\n',
    stderr: '',
  });

  expect(exitCode).toBe(1);

  expect(ctx.calls).toStrictEqual([
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
  ]);
});

test('it fails on stderr and runs no validator when renovate.yml pins no single version', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'default.json': JSON.stringify({
      packageRules: [
        {
          matchPackageNames: firstPartyScopes.map((scope) => `${scope}**`),
          minimumReleaseAge: null,
        },
      ],
    }),
  });

  await writeTreeFiles(ctx.directory, {
    '.github/workflows/renovate.yml':
      'jobs:\n  renovate:\n    steps:\n      - uses: renovatebot/github-action@def\n',
  });

  const exitCode = await ctx.runCheck({ exitCode: 0, stdout: '', stderr: '' });

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    '.github/workflows/renovate.yml: the renovate job holds 0 renovate-version inputs; the check reads exactly one\n',
  ]);

  expect(ctx.calls).toBeEmpty();
});

test('it fails on stderr and runs no validator when renovate.yml does not allow a post-upgrade command', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'default.json': JSON.stringify({
      packageRules: [
        {
          matchPackageNames: firstPartyScopes.map((scope) => `${scope}**`),
          minimumReleaseAge: null,
        },
        { postUpgradeTasks: { commands: ['bun run --if-present node_modules/.bin/gadget init'] } },
      ],
    }),
  });

  await writeTreeFiles(ctx.directory, {
    '.github/workflows/renovate.yml': [
      'jobs:',
      '  renovate:',
      '    steps:',
      '      - with:',
      '          renovate-version: 44.1.0',
      '        env:',
      `          RENOVATE_ALLOWED_COMMANDS: '["^bun run --if-present node_modules/\\\\.bin/widget init$"]'`,
      '',
    ].join('\n'),
  });

  const exitCode = await ctx.runCheck({ exitCode: 0, stdout: '', stderr: '' });

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    "default.json: no RENOVATE_ALLOWED_COMMANDS pattern in .github/workflows/renovate.yml allows 'bun run --if-present node_modules/.bin/gadget init'\n",
  ]);

  expect(ctx.calls).toBeEmpty();
});

test('it fails on stderr and runs no validator when the first-party rule and the check disagree', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'default.json': JSON.stringify({
      packageRules: [{ matchPackageNames: ['@zgeoff/**'], minimumReleaseAge: null }],
    }),
  });

  await writeTreeFiles(ctx.directory, {
    '.github/workflows/renovate.yml':
      'jobs:\n  renovate:\n    steps:\n      - with:\n          renovate-version: 44.1.0\n',
  });

  const exitCode = await ctx.runCheck({ exitCode: 0, stdout: '', stderr: '' });

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    `default.json: the rules that lift the release-age wait match @zgeoff/**, but the dependency-gates check treats ${firstPartyScopes.map((scope) => `${scope}**`).join(', ')} as first party\n`,
  ]);

  expect(ctx.calls).toBeEmpty();
});
