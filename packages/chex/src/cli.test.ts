import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';

interface CheckCase {
  readonly files?: Readonly<Record<string, string>>;

  // A file the case writes after the branch commit, so the branch holds an uncommitted change.
  readonly uncommitted?: Readonly<Record<string, string>>;

  readonly message?: string;

  readonly withCommitlint?: boolean;

  readonly args?: readonly string[];
}

// Every git call gets a clean environment, so a GIT_DIR this test inherits from a real hook cannot
// reach the repo it runs in.
async function setupTest() {
  const cliPath = join(import.meta.dir, 'cli.ts');
  const repoRoot = join(import.meta.dir, '../../..');

  const directory = await mkdtemp(join(tmpdir(), 'chex-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  const repo = join(directory, 'repo');

  await $`git init --quiet --bare --initial-branch=main ${join(directory, 'upstream.git')}`
    .cwd(directory)
    .env(env);

  await $`git init --quiet --initial-branch=main ${repo}`.cwd(directory).env(env);
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(repo).env(env);
  await $`git remote add origin ${join(directory, 'upstream.git')}`.cwd(repo).env(env);
  await $`git push --quiet -u origin main`.cwd(repo).env(env);
  await $`git switch --quiet -c feature`.cwd(repo).env(env);

  const writeFiles = async (files: Readonly<Record<string, string>>) => {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(repo, path)), { recursive: true });

      // The local-paths case writes the home folder, which only the setup knows.
      await writeFile(join(repo, path), text.replaceAll('{home}', directory));
    }
  };

  const runCase = async (name: string, check: Readonly<CheckCase>) => {
    await writeFiles({ '.gitignore': 'node_modules/\n', ...check.files });

    if (check.withCommitlint === true) {
      await mkdir(join(repo, 'node_modules/.bin'), { recursive: true });
      await mkdir(join(repo, 'node_modules/@zgeoff'), { recursive: true });
      await mkdir(join(repo, 'node_modules/@commitlint'), { recursive: true });

      await symlink(
        join(repoRoot, 'node_modules/.bin/commitlint'),
        join(repo, 'node_modules/.bin/commitlint'),
      );

      for (const linked of ['@zgeoff/commitlint-config', '@commitlint/cli']) {
        await symlink(join(repoRoot, 'node_modules', linked), join(repo, 'node_modules', linked));
      }
    }

    await $`git add -A`.cwd(repo).env(env);
    await $`git commit --quiet -m ${check.message ?? 'docs: add the files'}`.cwd(repo).env(env);

    await writeFiles(check.uncommitted ?? {});

    const result = await $`bun ${cliPath} ${name} ${check.args ?? []}`
      .cwd(repo)
      .env(env)
      .nothrow()
      .quiet();

    const lines = result.stdout.toString().trimEnd().split('\n');

    return { exitCode: result.exitCode, lastLine: lines.at(-1) };
  };

  const runCLI = (...args: readonly string[]) => $`bun ${cliPath} ${args}`.nothrow().quiet();

  return { env, runCase, runCLI };
}

test.each<[string, CheckCase]>([
  ['prose', { files: { 'README.md': '# Kettle\n\nThe kettle boils water.\n' } }],
  ['length', { files: { 'README.md': '- The kettle boils.\n'.repeat(10) } }],
  [
    'links',
    {
      files: {
        'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n',
        'guide.md': '# Guide\n',
      },
    },
  ],
  ['readmes', { files: { 'README.md': '# Kettle\n' } }],
  ['vision', { files: { 'docs/vision.md': '# Vision\n\nThe kettle boils water for one team.\n' } }],
  [
    'skill',
    {
      files: {
        '.claude/skills/kettle/SKILL.md':
          '---\nname: kettle\ndescription: Boils water for the team.\n---\n\n# Kettle\n',
      },
    },
  ],
  ['commits', { message: 'docs: add the files' }],
  ['local-paths', { files: { 'notes.txt': 'The kettle boils.\n' } }],
  ['test-timeouts', { files: { 'bunfig.toml': '[test]\ntimeout = 5000\n' } }],
  ['workflows', {}],
  ['dependency-gates', { files: { 'package.json': JSON.stringify({ name: 'kettle' }) } }],
  ['uncommitted', { files: { 'notes.txt': 'The kettle boils.\n' } }],
])('it prints cleared and exits 0 when the %s check passes', async (name, check) => {
  const ctx = await setupTest();
  const result = await ctx.runCase(name, check);

  expect(result).toStrictEqual({ exitCode: 0, lastLine: `cleared: ${name}` });
});

test.each<[string, CheckCase, number]>([
  ['prose', { files: { 'README.md': '# Kettle\n\nThe lid is load-bearing.\n' } }, 1],
  ['length', { files: { 'README.md': '- The kettle boils.\n'.repeat(101) } }, 1],
  ['links', { files: { 'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n' } }, 1],
  ['readmes', { files: { 'README.md': '# Kettle\n', 'notes/README.md': '# Notes\n' } }, 1],
  ['vision', { files: { 'README.md': '# Kettle\n' } }, 1],
  ['skill', { files: { '.claude/skills/kettle/SKILL.md': '---\nname: kettle\n---\n' } }, 1],
  ['commits', { message: 'tidy up', withCommitlint: true }, 1],
  ['local-paths', { files: { 'notes.txt': 'cache: {home}/.cache\n' } }, 1],
  ['test-timeouts', { files: { 'bunfig.toml': '[test]\ntimeout = 20000\n' } }, 1],
  ['workflows', { args: ['--profile'] }, 2],
  [
    'dependency-gates',
    {
      files: {
        'package.json': JSON.stringify({ name: 'kettle' }),
        'bunfig.toml': [
          '[install]',
          '# left-pad 1.3.1 (published 2020-03-01, patches GHSA-aaaa-bbbb-cccc) ages past the gate ~2020-03-08 — remove then (audit-fix)',
          'minimumReleaseAgeExcludes = ["left-pad"]',
        ].join('\n'),
      },
    },
    1,
  ],
  [
    'uncommitted',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      uncommitted: { 'notes.txt': 'The kettle sings.\n' },
    },
    1,
  ],
])('it prints bounced when the %s check fails', async (name, check, exitCode) => {
  const ctx = await setupTest();
  const result = await ctx.runCase(name, check);

  expect(result).toStrictEqual({ exitCode, lastLine: `bounced: ${name}` });
});

test('it prints each check of a list on its own line and exits 1 when one bounces', async () => {
  const ctx = await setupTest();

  const result = await ctx.runCase('length', {
    files: { 'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n' },
    args: ['links'],
  });

  expect(result).toStrictEqual({ exitCode: 1, lastLine: 'bounced: links' });
});

test('it exits 2 with the usage on an unknown check', async () => {
  const ctx = await setupTest();
  const result = await ctx.runCLI('spelling');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr:
      'chex: unknown check "spelling"\n' +
      'usage: chex <check>... | chex <check> [args...] | chex init\n' +
      'checks: prose, length, links, readmes, vision, skill, commits, local-paths, test-timeouts, workflows, dependency-gates, uncommitted\n',
  });
});
