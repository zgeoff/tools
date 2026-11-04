import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { $ } from 'bun';
import { buildInitGuardHooks } from './build-init-guard-hooks.ts';
import { createChexBaselineRepo } from './create-chex-baseline-repo.ts';
import { readCallLog } from './read-call-log.ts';

async function setupTest() {
  const directory = await mkdtemp(
    join(tmpdir(), readRunFolderPrefix('create-chex-baseline-repo-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'repo');
  const toolsRoot = join(import.meta.dir, '../../../..');
  const rigLog = join(directory, 'rig-calls');
  const packageDir = join(import.meta.dir, '..', '..');
  const chex = { packageDir, binPath: join(packageDir, 'src/cli.ts') };

  return { root, toolsRoot, chex, rigLog, bin: join(root, 'node_modules/.bin') };
}

test('it writes the files chex init leaves, with the fixture files and scripts added', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(
    ctx.root,
    { toolsRoot: ctx.toolsRoot, chex: ctx.chex, rigLog: ctx.rigLog },
    {
      realChecks: [],
      scripts: { 'format:check': 'true', typecheck: 'tsc' },
      files: { 'notes.txt': 'The kettle boils.\n' },
      rig: 'exit 0',
      oxlint: 'exit 0',
      withCommitlint: false,
    },
  );

  const lefthook = await readFile(join(ctx.root, 'lefthook.yml'), 'utf8');
  const packageText = await readFile(join(ctx.root, 'package.json'), 'utf8');

  const packageJSON: unknown = JSON.parse(packageText);

  const notes = await readFile(join(ctx.root, 'notes.txt'), 'utf8');
  const chexLink = await readlink(join(ctx.root, 'node_modules/@zgeoff/chex'));

  expect(lefthook).toBe(
    `extends:
  - node_modules/@zgeoff/chex/lefthook.yml
${buildInitGuardHooks()}`,
  );

  expect(packageJSON).toStrictEqual({ scripts: { 'format:check': 'true', typecheck: 'tsc' } });
  expect(notes).toBe('The kettle boils.\n');
  expect(chexLink).toBe(ctx.chex.packageDir);
});

test('it stubs chex to clear each check it does not run for real', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(
    ctx.root,
    { toolsRoot: ctx.toolsRoot, chex: ctx.chex, rigLog: ctx.rigLog },
    {
      realChecks: ['prose'],
      scripts: {},
      files: {},
      rig: 'exit 0',
      oxlint: 'exit 0',
      withCommitlint: false,
    },
  );

  const result = await $`${join(ctx.bin, 'chex')} commits`.cwd(ctx.root).nothrow().quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: 'cleared: commits\n',
  });
});

test('it stubs rig to log each call, and marks a call that the stub diet wraps', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(
    ctx.root,
    { toolsRoot: ctx.toolsRoot, chex: ctx.chex, rigLog: ctx.rigLog },
    {
      realChecks: [],
      scripts: {},
      files: {},
      rig: 'exit 4',
      oxlint: 'exit 0',
      withCommitlint: false,
    },
  );

  const wrapped = await $`${join(ctx.bin, 'diet')} -- ${join(ctx.bin, 'rig')} related kettle.ts`
    .cwd(ctx.root)
    .nothrow()
    .quiet();

  const bare = await $`${join(ctx.bin, 'rig')} related lid.ts`.cwd(ctx.root).nothrow().quiet();
  const calls = await readCallLog(ctx.rigLog);

  expect(wrapped.exitCode).toBe(4);
  expect(bare.exitCode).toBe(4);
  expect(calls).toStrictEqual(['under diet: related kettle.ts', 'related lid.ts']);
});

test('it links no commitlint for a fixture that does not ask for it', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(
    ctx.root,
    { toolsRoot: ctx.toolsRoot, chex: ctx.chex, rigLog: ctx.rigLog },
    {
      realChecks: [],
      scripts: {},
      files: {},
      rig: 'exit 0',
      oxlint: 'exit 0',
      withCommitlint: false,
    },
  );

  expect(existsSync(join(ctx.root, 'node_modules/.bin/commitlint'))).toBeFalse();
});

test('it links commitlint for a fixture that asks for it', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(
    ctx.root,
    { toolsRoot: ctx.toolsRoot, chex: ctx.chex, rigLog: ctx.rigLog },
    {
      realChecks: [],
      scripts: {},
      files: {},
      rig: 'exit 0',
      oxlint: 'exit 0',
      withCommitlint: true,
    },
  );

  expect(existsSync(join(ctx.root, 'node_modules/.bin/commitlint'))).toBeTrue();
});
