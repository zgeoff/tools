import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'check-length-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q'], { cwd: dir });

  const scriptPath = fileURLToPath(new URL('check-length.sh', import.meta.url));

  const writeLines = async (path: string, count: number) => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), 'The tool reads one file.\n'.repeat(count));
  };

  const writeText = async (path: string, text: string) => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  };

  const run = (...args: readonly string[]) =>
    spawnSync('bash', [scriptPath, ...args], { cwd: dir, encoding: 'utf8' });

  return { dir, writeLines, writeText, run };
}

test('it fails when the plain repo README is over its limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 61);

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('README.md: 61 lines, over the plain repo README limit of 60');
});

test('it warns and passes when a README is over its target but within its limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 55);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('README.md: 55 lines, over the plain repo README target of 50');
});

test('it fails a package README over 130 lines beside a public package.json', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'package.json'), '{ "name": "demo" }\n');

  await ctx.writeLines('README.md', 131);

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('README.md: 131 lines, over the package README limit of 130');
});

test('it reads a README beside a private package.json as a package when --package names it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'package.json'), '{ "name": "demo", "private": true }\n');

  await ctx.writeLines('README.md', 125);

  const result = ctx.run('--package', 'README.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('README.md: 125 lines, over the package README target of 120');
});

test('it fails a sub-package README over 70 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('kernel/README.md', 71);

  const result = ctx.run();

  expect(result.status).toBe(1);

  expect(result.stdout).toInclude(
    'kernel/README.md: 71 lines, over the sub-package README limit of 70',
  );
});

test('it warns and passes when a docs file is over its cap', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('docs/architecture/overview.md', 251);

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toInclude(
    'docs/architecture/overview.md: 251 lines, over the docs cap of 250',
  );
});

test('it holds a runbook to a cap of 300 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('docs/runbooks/operations.md', 300);
  await ctx.writeLines('docs/runbooks/releasing.md', 301);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('docs/runbooks/operations.md');

  expect(result.stdout).toInclude(
    'docs/runbooks/releasing.md: 301 lines, over the docs cap of 300',
  );
});

test('it reads docs/README.md as a doc, not as a README', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('docs/README.md', 100);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('docs/README.md');
});

test('it passes when every README and doc is under its limit and cap', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 50);
  await ctx.writeLines('docs/guides/setup.md', 250);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('README.md: 50 lines (plain repo README; target 50, limit 60)');
  expect(result.stdout).toInclude('check-prose: clean');
});

test('it fails when check-prose finds a violation in a doc', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);

  await mkdir(join(ctx.dir, 'docs'), { recursive: true });
  await writeFile(join(ctx.dir, 'docs/overview.md'), 'The cache is load-bearing.\n');

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('docs/overview.md:1:The cache is load-bearing.');
});

test('it fails when check-prose finds a violation in a skill', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeText('.claude/skills/demo/SKILL.md', 'The cache is load-bearing.\n');

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('.claude/skills/demo/SKILL.md:1:The cache is load-bearing.');
});

test('it skips a skill that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeText('.gitattributes', '.claude/skills/vendor-db/** linguist-vendored\n');
  await ctx.writeText('.claude/skills/vendor-db/SKILL.md', 'The cache is load-bearing.\n');

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('load-bearing');
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

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('.claude/skills/demo/SKILL.md: has no description');
});

test('it fails when the repo has check-project-verbs and the verbs differ', async () => {
  const ctx = await setupTest();

  const checkVerbs = fileURLToPath(
    new URL('../../code-style/scripts/check-project-verbs.sh', import.meta.url),
  );

  await ctx.writeLines('README.md', 10);

  const source = await readFile(checkVerbs, 'utf8');

  await ctx.writeText('.claude/skills/code-style/scripts/check-project-verbs.sh', source);

  await ctx.writeText(
    '.claude/skills/project-code-style/SKILL.md',
    '## Project verbs\n\n- `mint`\n',
  );

  await ctx.writeText('.oxlintrc.json', '{ "rules": {} }\n');

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('lists `mint`, which .oxlintrc.json lacks in verbs');
});

test('it rejects --package naming a missing README', async () => {
  const ctx = await setupTest();

  const result = ctx.run('--package', 'README.md');

  expect(result.status).toBe(2);
  expect(result.stderr).toBe('check-length: --package names README.md, which does not exist\n');
});

test('it checks a README whose path is not ASCII', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('café/README.md', 71);

  const result = ctx.run();

  expect(result.status).toBe(1);

  expect(result.stdout).toInclude(
    'café/README.md: 71 lines, over the sub-package README limit of 70',
  );
});

test('it fails a value with a unit under docs/architecture but not one in code or a year', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);

  await mkdir(join(ctx.dir, 'docs/architecture'), { recursive: true });

  await writeFile(
    join(ctx.dir, 'docs/architecture/overview.md'),
    [
      'The design dates from the 1990s.',
      'The grid is 2d.',
      'Run `sleep 5s` to wait.',
      'The reaper waits 30 s.',
      '',
    ].join('\n'),
  );

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('docs/architecture/overview.md:4:The reaper waits 30 s.');
  expect(result.stdout).not.toInclude('overview.md:1:');
  expect(result.stdout).not.toInclude('overview.md:2:');
  expect(result.stdout).not.toInclude('overview.md:3:');
});
