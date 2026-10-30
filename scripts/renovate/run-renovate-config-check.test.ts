import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { firstPartyScopes } from '../../sync/pre-push/dependency-gates/first-party-scopes.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { CommandOptions, CommandResult } from '../ci/run-command.ts';
import { runRenovateConfigCheck } from './run-renovate-config-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-renovate-config-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const calls: { argv: readonly string[]; cwd: string }[] = [];
  const errors: string[] = [];

  const writeWorkflow = (text: string) =>
    writeTreeFiles(directory, { '.github/workflows/renovate.yml': text });

  const writePreset = (matchPackageNames: readonly string[]) =>
    writeTreeFiles(directory, {
      'default.json': JSON.stringify({ packageRules: [{ matchPackageNames }] }),
    });

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

  return { directory, calls, errors, writeWorkflow, writePreset, runCheck };
}

test('it validates default.json strictly at the pinned version and returns the validator exit code', async () => {
  const ctx = await setupTest();

  await ctx.writePreset(firstPartyScopes.map((scope) => `${scope}**`));

  await ctx.writeWorkflow(
    'jobs:\n  renovate:\n    steps:\n      - with:\n          renovate-version: 44.1.0\n',
  );

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

  await ctx.writePreset(firstPartyScopes.map((scope) => `${scope}**`));

  await ctx.writeWorkflow(
    'jobs:\n  renovate:\n    steps:\n      - uses: renovatebot/github-action@def\n',
  );

  const exitCode = await ctx.runCheck({ exitCode: 0, stdout: '', stderr: '' });

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    '.github/workflows/renovate.yml: the renovate job holds 0 renovate-version inputs; the check reads exactly one\n',
  ]);

  expect(ctx.calls).toBeEmpty();
});

test('it fails on stderr and runs no validator when the first-party rule and the check disagree', async () => {
  const ctx = await setupTest();

  await ctx.writePreset(['@zgeoff/**']);

  await ctx.writeWorkflow(
    'jobs:\n  renovate:\n    steps:\n      - with:\n          renovate-version: 44.1.0\n',
  );

  const exitCode = await ctx.runCheck({ exitCode: 0, stdout: '', stderr: '' });

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    `default.json: the first-party rule matches @zgeoff/**, but the dependency-gates check treats ${firstPartyScopes.map((scope) => `${scope}**`).join(', ')} as first party\n`,
  ]);

  expect(ctx.calls).toBeEmpty();
});
