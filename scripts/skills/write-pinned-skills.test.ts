import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import type { InstallLockOptions } from './with-install-lock.ts';
import { withInstallLock } from './with-install-lock.ts';
import { writePinnedSkills } from './write-pinned-skills.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-pinned-skills-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const tools = join(directory, 'tools');
  const archives = join(directory, 'archives');

  await mkdir(join(tools, 'sync'), { recursive: true });
  await mkdir(archives);

  const output: string[] = [];

  // Packs the files as GitHub's archive of zgeoff/skills at the commit, under one top folder.
  const writeArchive = async (commit: string, files: Readonly<Record<string, string>>) => {
    const top = join(directory, 'pack', `skills-${commit}`);

    await writeTreeFiles(top, files);

    await $`tar -czf ${join(archives, commit)} -C ${join(directory, 'pack')} ${`skills-${commit}`}`.quiet();
  };

  const writePin = (commit: string) =>
    writeFile(join(tools, 'sync', 'skills-pin.json'), JSON.stringify({ commit }));

  const lockPath = join(tools, '.zgeoff-skills.lock');

  // Every owner counts as running, and each wait lets the other runs move on.
  const buildLockOptions = (
    ownerID: string,
    wait: () => Promise<void> = () =>
      new Promise((resolve) => {
        setImmediate(resolve);
      }),
  ): InstallLockOptions => ({
    lockPath,
    ownerID,
    probeOwner: () => true,
    wait,
    attempts: 100_000,
  });

  const install = (
    skills: readonly string[],
    runID = 'run',
    lockOptions: InstallLockOptions = buildLockOptions(runID),
  ) =>
    writePinnedSkills({
      cwd: tools,
      env: process.env,
      archiveBaseURL: `file://${archives}/`,
      skills,
      fileSystem: nodeFileSystem,
      renamePath: rename,
      runID,
      withLock: (path, work) => withInstallLock({ ...lockOptions, lockPath: path }, work),
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { tools, archives, output, writeArchive, writePin, install, buildLockOptions };
}

test('it links each skill to its folder in the tree of the pinned commit', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';

  await ctx.writePin(commit);

  await ctx.writeArchive(commit, {
    'skills/kettle/SKILL.md': '# Kettle\n',
    'skills/teapot/SKILL.md': '# Teapot\n',
  });

  const exitCode = await ctx.install(['kettle']);
  const link = await readlink(join(ctx.tools, '.claude', 'skills', 'kettle'));
  const text = await readFile(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'), 'utf8');

  expect(exitCode).toBe(0);
  expect(link).toBe(`../../.zgeoff-skills/${commit}/skills/kettle`);
  expect(text).toBe('# Kettle\n');
  expect(existsSync(join(ctx.tools, '.claude', 'skills', 'teapot'))).toBeFalse();
  expect(ctx.output).toStrictEqual([`skills: linked kettle from zgeoff/skills at ${commit}\n`]);
});

test('it keeps a tree it already unpacked and fetches nothing', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';

  await ctx.writePin(commit);

  await mkdir(join(ctx.tools, '.zgeoff-skills', commit, 'skills', 'kettle'), { recursive: true });

  await writeFile(
    join(ctx.tools, '.zgeoff-skills', commit, 'skills', 'kettle', 'SKILL.md'),
    '# Kettle, unpacked earlier\n',
  );

  const exitCode = await ctx.install(['kettle']);
  const text = await readFile(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'), 'utf8');

  expect(exitCode).toBe(0);
  expect(text).toBe('# Kettle, unpacked earlier\n');
});

test('it moves the link to the tree of a new pin and removes the old tree', async () => {
  const ctx = await setupTest();

  const older = '0123456789abcdef0123456789abcdef01234567';
  const newer = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writeArchive(older, { 'skills/kettle/SKILL.md': '# Kettle\n' });
  await ctx.writeArchive(newer, { 'skills/kettle/SKILL.md': '# Kettle, rewritten\n' });
  await ctx.writePin(older);
  await ctx.install(['kettle']);
  await ctx.writePin(newer);

  const exitCode = await ctx.install(['kettle']);
  const text = await readFile(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'), 'utf8');

  expect(exitCode).toBe(0);
  expect(text).toBe('# Kettle, rewritten\n');
  expect(existsSync(join(ctx.tools, '.zgeoff-skills', older))).toBeFalse();
});

test('it leaves a folder of its own at a skill path in place and fails', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';

  await ctx.writePin(commit);
  await ctx.writeArchive(commit, { 'skills/kettle/SKILL.md': '# Kettle\n' });

  await mkdir(join(ctx.tools, '.claude', 'skills', 'kettle'), { recursive: true });

  await writeFile(
    join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'),
    '# Kettle, by hand\n',
  );

  const exitCode = await ctx.install(['kettle']);
  const text = await readFile(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'), 'utf8');

  expect(exitCode).toBe(1);
  expect(text).toBe('# Kettle, by hand\n');

  expect(ctx.output).toStrictEqual([
    'skills: .claude/skills/kettle is a folder of its own, so the skill is not linked; move it, then run bun run skills:install\n',
  ]);
});

test('it fails when the pinned tree holds no such skill', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';

  await ctx.writePin(commit);
  await ctx.writeArchive(commit, { 'skills/kettle/SKILL.md': '# Kettle\n' });

  const exitCode = await ctx.install(['teapot']);

  expect(exitCode).toBe(1);
  expect(ctx.output).toStrictEqual([`skills: zgeoff/skills at ${commit} holds no teapot skill\n`]);
});

test('it fails when the pin holds no full commit ID', async () => {
  const ctx = await setupTest();

  await ctx.writePin('main');

  const exitCode = await ctx.install(['kettle']);

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    'skills: sync/skills-pin.json holds no full commit ID of zgeoff/skills\n',
  ]);
});

test('it lets two installs of the pinned commit run at once', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';

  await ctx.writePin(commit);
  await ctx.writeArchive(commit, { 'skills/kettle/SKILL.md': '# Kettle\n' });

  const exitCodes = await Promise.all([
    ctx.install(['kettle'], 'first'),
    ctx.install(['kettle'], 'second'),
  ]);

  const text = await readFile(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'), 'utf8');
  const trees = await readdir(join(ctx.tools, '.zgeoff-skills'));

  expect(exitCodes).toStrictEqual([0, 0]);
  expect(text).toBe('# Kettle\n');
  expect(trees).toStrictEqual([commit]);
});

test('it removes the unpacking folder that a stopped run left', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';

  await ctx.writePin(commit);
  await ctx.writeArchive(commit, { 'skills/kettle/SKILL.md': '# Kettle\n' });

  await mkdir(join(ctx.tools, '.zgeoff-skills', `${commit}.stopped.partial`), { recursive: true });

  const exitCode = await ctx.install(['kettle']);
  const trees = await readdir(join(ctx.tools, '.zgeoff-skills'));

  expect(exitCode).toBe(0);
  expect(trees).toStrictEqual([commit]);
});

test('it waits for the install that holds the lock before it unpacks', async () => {
  const ctx = await setupTest();

  const commit = '0123456789abcdef0123456789abcdef01234567';

  await ctx.writePin(commit);
  await ctx.writeArchive(commit, { 'skills/kettle/SKILL.md': '# Kettle\n' });

  const waited = Promise.withResolvers<void>();

  const waiting = ctx.buildLockOptions('waiting', () => {
    waited.resolve();

    return new Promise((resolve) => {
      setImmediate(resolve);
    });
  });

  // The install comes back wrapped, as awaiting it while the lock is held would never end.
  const run = await withInstallLock(ctx.buildLockOptions('holding'), async () => {
    const pending = ctx.install(['kettle'], 'waiting', waiting);

    await waited.promise;

    return { pending, hasTree: existsSync(join(ctx.tools, '.zgeoff-skills')) };
  });

  const exitCode = await run.pending;

  expect(run.hasTree).toBeFalse();
  expect(exitCode).toBe(0);
  expect(existsSync(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'))).toBeTrue();
});
