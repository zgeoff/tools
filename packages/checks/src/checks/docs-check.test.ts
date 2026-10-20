import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { runChecks } from '../run-checks.ts';
import { docsCheck } from './docs-check.ts';

// A git repo in a temp folder, with the real docs scripts copied to where repo-sync puts them or
// where tools keeps them. Every process gets a clean environment, so a GIT_DIR that a pre-push hook
// exports cannot point git at the repo this test runs in.
async function setupTest(scripts: 'synced' | 'sources' | 'none') {
  const directory = await mkdtemp(join(tmpdir(), 'docs-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  await $`git init --quiet`.cwd(directory).env(env);

  const skills = join(import.meta.dir, '../../../../sync/skills');
  const roots = { synced: ['.claude/skills'], sources: ['sync/skills'], none: [] }[scripts];

  await Promise.all(
    roots.map(async (root) => {
      await cp(
        join(skills, 'docs-writing/scripts'),
        join(directory, root, 'docs-writing/scripts'),
        {
          recursive: true,
        },
      );

      await cp(
        join(skills, 'skill-writing/scripts/check-skill.sh'),
        join(directory, root, 'skill-writing/scripts/check-skill.sh'),
      );
    }),
  );

  const writeDoc = async (path: string, text: string) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), text);
  };

  return { directory, env, writeDoc };
}

test('it passes clean docs', async () => {
  const ctx = await setupTest('synced');

  await ctx.writeDoc('README.md', '# Lantern\n\nLantern prints the time in each city you list.\n');

  await ctx.writeDoc(
    '.claude/skills/weather/SKILL.md',
    '---\nname: weather\ndescription: Reads the forecast for a city.\n---\n\n# Weather\n\nRead the forecast first.\n',
  );

  const findings = await docsCheck.check({
    cwd: ctx.directory,
    files: ['README.md', '.claude/skills/weather/SKILL.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports a banned word at its line', async () => {
  const ctx = await setupTest('synced');

  await ctx.writeDoc('README.md', '# Lantern\n\nLantern shows a surface for each city.\n');

  const findings = await docsCheck.check({
    cwd: ctx.directory,
    files: ['README.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([
    { path: 'README.md', line: 3, message: 'check-prose: Banned words' },
  ]);
});

test('it reports a README over its line limit at its first line', async () => {
  const ctx = await setupTest('synced');

  await ctx.writeDoc('README.md', '- Lantern reads one city.\n'.repeat(61));

  const findings = await docsCheck.check({
    cwd: ctx.directory,
    files: ['README.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([
    {
      path: 'README.md',
      line: 1,
      message: 'check-length: 61 lines, over the plain repo README limit of 60 (target 50)',
    },
  ]);
});

test('it passes a README over its line target but within its limit', async () => {
  const ctx = await setupTest('synced');

  await ctx.writeDoc('README.md', '- Lantern reads one city.\n'.repeat(55));

  const findings = await docsCheck.check({
    cwd: ctx.directory,
    files: ['README.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports a broken relative link at its line', async () => {
  const ctx = await setupTest('synced');

  await ctx.writeDoc('README.md', '# Lantern\n\nRead [the guide](docs/guide.md) first.\n');

  const findings = await docsCheck.check({
    cwd: ctx.directory,
    files: ['README.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([
    {
      path: 'README.md',
      line: 3,
      message: 'check-links: (docs/guide.md) docs/guide.md does not exist',
    },
  ]);
});

test('it reports a skill whose name differs from its folder', async () => {
  const ctx = await setupTest('synced');

  await ctx.writeDoc(
    '.claude/skills/weather/SKILL.md',
    '---\nname: forecast\ndescription: Reads the forecast for a city.\n---\n\n# Weather\n\nRead the forecast first.\n',
  );

  const findings = await docsCheck.check({
    cwd: ctx.directory,
    files: ['.claude/skills/weather/SKILL.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([
    {
      path: '.claude/skills/weather/SKILL.md',
      line: 1,
      message: 'check-skill: name forecast does not match the folder weather',
    },
  ]);
});

test('it runs the script sources when the repo keeps them under sync/skills', async () => {
  const ctx = await setupTest('sources');

  await ctx.writeDoc('README.md', '# Lantern\n\nLantern shows a surface for each city.\n');

  const findings = await docsCheck.check({
    cwd: ctx.directory,
    files: ['README.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([
    { path: 'README.md', line: 3, message: 'check-prose: Banned words' },
  ]);
});

test('it names the repo-sync entry when the repo has no docs scripts', async () => {
  const ctx = await setupTest('none');

  await ctx.writeDoc('README.md', '# Lantern\n\nLantern prints the time in each city you list.\n');

  expect(() =>
    docsCheck.check({ cwd: ctx.directory, files: ['README.md'], env: ctx.env }),
  ).toThrowWithMessage(Error, /Take the skill-docs-writing entry of repo-sync/u);
});

test('it reads every doc when the run lists only some of them', async () => {
  const ctx = await setupTest('synced');

  await ctx.writeDoc('README.md', '# Lantern\n\nLantern prints the time in each city you list.\n');
  await ctx.writeDoc('docs/guide.md', '# Guide\n\nRead [the setup](setup.md) first.\n');

  const findings = await runChecks({
    cwd: ctx.directory,
    checks: [docsCheck],
    config: { off: new Map() },
    files: ['README.md'],
    env: ctx.env,
  });

  expect(findings).toStrictEqual([
    {
      check: 'docs',
      path: 'docs/guide.md',
      line: 3,
      message: 'check-links: (setup.md) docs/setup.md does not exist',
    },
  ]);
});
