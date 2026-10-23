import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-length-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // A clean environment: a pre-push hook in a linked worktree exports GIT_DIR, which would point
  // git init and the script's git calls at the real repository.
  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  await $`git init -q`.cwd(directory).env(env).quiet();

  const scriptPath = fileURLToPath(new URL('check-length.sh', import.meta.url));

  const writeLines = async (path: string, count: number) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });

    // Each line is a list item, which the prose check's paragraph limit skips.
    await writeFile(join(directory, path), '- The tool reads one file.\n'.repeat(count));
  };

  const writeText = async (path: string, text: string) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), text);
  };

  const run = (...args: readonly string[]) =>
    $`bash ${scriptPath} ${args}`.cwd(directory).env(env).nothrow().quiet();

  return { directory, writeLines, writeText, run };
}

test('it fails when the plain repo README is over its limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 61);

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toInclude(
    'README.md: 61 lines, over the plain repo README limit of 60',
  );
});

test('it warns and passes when a README is over its target but within its limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 55);

  const result = await ctx.run();

  expect(result.exitCode).toBe(0);

  expect(result.stdout.toString()).toInclude(
    'README.md: 55 lines, over the plain repo README target of 50',
  );
});

test('it fails a package README over 130 lines beside a public package.json', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), '{ "name": "demo" }\n');

  await ctx.writeLines('README.md', 131);

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toInclude(
    'README.md: 131 lines, over the package README limit of 130',
  );
});

test('it reads a README beside a private package.json as a package when --package names it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), '{ "name": "demo", "private": true }\n');

  await ctx.writeLines('README.md', 125);

  const result = await ctx.run('--package', 'README.md');

  expect(result.exitCode).toBe(0);

  expect(result.stdout.toString()).toInclude(
    'README.md: 125 lines, over the package README target of 120',
  );
});

test('it fails a sub-package README over 70 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('kernel/README.md', 71);

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toInclude(
    'kernel/README.md: 71 lines, over the sub-package README limit of 70',
  );
});

test('it warns and passes when a docs file is over its cap', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('docs/architecture/overview.md', 251);

  const result = await ctx.run();

  expect(result.exitCode).toBe(0);

  expect(result.stdout.toString()).toInclude(
    'docs/architecture/overview.md: 251 lines, over the docs cap of 250',
  );
});

test('it holds a runbook to a cap of 300 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('docs/runbooks/operations.md', 300);
  await ctx.writeLines('docs/runbooks/releasing.md', 301);

  const result = await ctx.run();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).not.toInclude('docs/runbooks/operations.md');

  expect(result.stdout.toString()).toInclude(
    'docs/runbooks/releasing.md: 301 lines, over the docs cap of 300',
  );
});

test('it reads docs/README.md as a doc, not as a README', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('docs/README.md', 100);

  const result = await ctx.run();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).not.toInclude('docs/README.md');
});

test('it passes when every README and doc is under its limit and cap', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 50);
  await ctx.writeLines('docs/guides/setup.md', 250);

  const result = await ctx.run();

  expect(result.exitCode).toBe(0);

  expect(result.stdout.toString()).toInclude(
    'README.md: 50 lines (plain repo README; target 50, limit 60)',
  );

  expect(result.stdout.toString()).toInclude('check-prose: clean');
});

test('it fails when check-prose finds a violation in a doc', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);

  await mkdir(join(ctx.directory, 'docs'), { recursive: true });
  await writeFile(join(ctx.directory, 'docs/overview.md'), 'The cache is load-bearing.\n');

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude('docs/overview.md:1:The cache is load-bearing.');
});

test('it fails when check-prose finds a violation in a skill', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeText('.claude/skills/demo/SKILL.md', 'The cache is load-bearing.\n');

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toInclude(
    '.claude/skills/demo/SKILL.md:1:The cache is load-bearing.',
  );
});

test('it skips a skill that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeText('.gitattributes', '.claude/skills/vendor-db/** linguist-vendored\n');
  await ctx.writeText('.claude/skills/vendor-db/SKILL.md', 'The cache is load-bearing.\n');

  const result = await ctx.run();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).not.toInclude('load-bearing');
});

test('it fails when the repo has check-skill and a skill fails it', async () => {
  const ctx = await setupTest();

  const checkSkill = fileURLToPath(
    new URL('../../skill-writing/scripts/check-skill.sh', import.meta.url),
  );

  await ctx.writeLines('README.md', 10);

  const source = await readFile(checkSkill, 'utf8');

  await ctx.writeText('.claude/skills/skill-writing/scripts/check-skill.sh', source);
  await ctx.writeText('.claude/skills/demo/SKILL.md', '---\nname: demo\n---\n');

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude('.claude/skills/demo/SKILL.md: has no description');
});

test('it rejects --package naming a missing README', async () => {
  const ctx = await setupTest();
  const result = await ctx.run('--package', 'README.md');

  expect(result.exitCode).toBe(2);

  expect(result.stderr.toString()).toBe(
    'check-length: --package names README.md, which does not exist\n',
  );
});

test('it checks a README whose path is not ASCII', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('café/README.md', 71);

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toInclude(
    'café/README.md: 71 lines, over the sub-package README limit of 70',
  );
});

test('it fails a value with a unit under docs/architecture but not one in code or a year', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);

  await mkdir(join(ctx.directory, 'docs/architecture'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'docs/architecture/overview.md'),
    [
      'The design dates from the 1990s.',
      'The grid is 2d.',
      'Run `sleep 5s` to wait.',
      'The reaper waits 30 s.',
      '',
    ].join('\n'),
  );

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toInclude(
    'docs/architecture/overview.md:4:The reaper waits 30 s.',
  );

  expect(result.stdout.toString()).not.toInclude('overview.md:1:');
  expect(result.stdout.toString()).not.toInclude('overview.md:2:');
  expect(result.stdout.toString()).not.toInclude('overview.md:3:');
});
