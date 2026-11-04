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
import { readRunFolderPrefix, waitFor, writeTreeFiles } from '@zgeoff/testing/helpers';
import invariant from 'tiny-invariant';
import { withFileLock } from '../../packages/std/src/with-file-lock.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeSkillsArchive } from '../test-utils/write-skills-archive.ts';
import { defaultPinnedSkills, writePinnedSkills } from './write-pinned-skills.ts';

async function setupTest() {
  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-write-pinned-skills-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const tools = join(directory, 'tools');
  const archives = join(directory, 'archives');

  await mkdir(join(tools, 'sync'), { recursive: true });
  await mkdir(archives);

  const output: string[] = [];

  const writeArchive = (commit: string, files: Readonly<Record<string, string>>) =>
    writeSkillsArchive({
      packDirectory: join(directory, 'pack'),
      archivePath: join(archives, commit),
      commit,
      files,
      writeTree: writeTreeFiles,
      runCommand,
      env: process.env,
    });

  const writePin = (commit: string) =>
    writeFile(join(tools, 'sync', 'skills-pin.json'), JSON.stringify({ commit }));

  const lockPath = join(tools, '.zgeoff-skills.lock');

  const install = (
    skills: readonly string[],
    runID = 'run',
    withLock: typeof withFileLock = withFileLock,
  ) =>
    writePinnedSkills({
      cwd: tools,
      env: process.env,
      archiveBaseURL: `file://${archives}/`,
      skills,
      fileSystem: nodeFileSystem,
      renamePath: rename,
      runID,
      withLock,
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const holdLock = <T>(work: () => Promise<T>) => withFileLock(lockPath, work);

  return { tools, archives, output, writeArchive, writePin, install, holdLock };
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

  // The install comes back wrapped, as awaiting it while the lock is held would never end.
  const run = await ctx.holdLock(async () => {
    const pending = ctx.install(['kettle'], 'waiting');

    await waitFor(() => {
      invariant(ctx.output.some((line) => line.includes('so this one waits for it')));
    });

    return { pending, hasTree: existsSync(join(ctx.tools, '.zgeoff-skills')) };
  });

  invariant(run.kind === 'ran');

  const exitCode = await run.value.pending;

  expect(run.value.hasTree).toBeFalse();
  expect(exitCode).toBe(0);
  expect(existsSync(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'))).toBeTrue();
});

test('it keeps every link and the old tree when the new pin lacks a skill', async () => {
  const ctx = await setupTest();

  const older = '0123456789abcdef0123456789abcdef01234567';
  const newer = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writeArchive(older, {
    'skills/kettle/SKILL.md': '# Kettle\n',
    'skills/teapot/SKILL.md': '# Teapot\n',
  });

  await ctx.writeArchive(newer, { 'skills/kettle/SKILL.md': '# Kettle, rewritten\n' });
  await ctx.writePin(older);
  await ctx.install(['kettle', 'teapot']);
  await ctx.writePin(newer);

  const exitCode = await ctx.install(['kettle', 'teapot']);
  const kettle = await readlink(join(ctx.tools, '.claude', 'skills', 'kettle'));
  const teapot = await readFile(join(ctx.tools, '.claude', 'skills', 'teapot', 'SKILL.md'), 'utf8');

  expect(exitCode).toBe(1);
  expect(kettle).toBe(`../../.zgeoff-skills/${older}/skills/kettle`);
  expect(teapot).toBe('# Teapot\n');
  expect(ctx.output.at(-1)).toBe(`skills: zgeoff/skills at ${newer} holds no teapot skill\n`);
});

test('it installs the pin as it stands once the lock is free', async () => {
  const ctx = await setupTest();

  const older = '0123456789abcdef0123456789abcdef01234567';
  const newer = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writeArchive(older, { 'skills/kettle/SKILL.md': '# Kettle\n' });
  await ctx.writeArchive(newer, { 'skills/kettle/SKILL.md': '# Kettle, rewritten\n' });
  await ctx.writePin(older);

  // The pin moves while the install waits, as a checkout of another branch does.
  const run = await ctx.holdLock(async () => {
    const pending = ctx.install(['kettle'], 'waiting');

    await waitFor(() => {
      invariant(ctx.output.some((line) => line.includes('so this one waits for it')));
    });

    await ctx.writePin(newer);

    return { pending };
  });

  invariant(run.kind === 'ran');

  const exitCode = await run.value.pending;
  const text = await readFile(join(ctx.tools, '.claude', 'skills', 'kettle', 'SKILL.md'), 'utf8');

  expect(exitCode).toBe(0);
  expect(text).toBe('# Kettle, rewritten\n');
  expect(existsSync(join(ctx.tools, '.zgeoff-skills', older))).toBeFalse();
});

test('it links each default skill when the pinned tree holds all five', async () => {
  const ctx = await setupTest();

  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writePin(commit);

  await ctx.writeArchive(commit, {
    'skills/code-style/SKILL.md': '# Code style\n',
    'skills/docs-writing/SKILL.md': '# Docs writing\n',
    'skills/skill-writing/SKILL.md': '# Skill writing\n',
    'skills/deslop/SKILL.md': '# Deslop\n',
    'skills/cold-read/SKILL.md': '# Cold read\n',
  });

  const exitCode = await ctx.install(defaultPinnedSkills);

  const skillsFolder = join(ctx.tools, '.claude', 'skills');

  const links = await Promise.all(
    ['code-style', 'docs-writing', 'skill-writing', 'deslop', 'cold-read'].map((skill) =>
      readlink(join(skillsFolder, skill)),
    ),
  );

  expect(exitCode).toBe(0);

  expect(links).toStrictEqual([
    `../../.zgeoff-skills/${commit}/skills/code-style`,
    `../../.zgeoff-skills/${commit}/skills/docs-writing`,
    `../../.zgeoff-skills/${commit}/skills/skill-writing`,
    `../../.zgeoff-skills/${commit}/skills/deslop`,
    `../../.zgeoff-skills/${commit}/skills/cold-read`,
  ]);
});

test('it gives up when another install keeps the lock past the wait', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.install(['kettle'], 'stuck', () =>
    Promise.resolve({ kind: 'busy', holder: null }),
  );

  expect(exitCode).toBe(1);

  expect(ctx.output.at(-1)).toBe(
    `skills: ${join(ctx.tools, '.zgeoff-skills.lock')} is held by another install; try again once it ends\n`,
  );
});
