import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { commitAllFiles } from '../test-utils/commit-all-files.ts';
import { getChexE2EPack } from '../test-utils/get-chex-e2e-pack.ts';
import { linkCommitlint } from '../test-utils/link-commitlint.ts';
import { readGitEnv } from '../test-utils/read-git-env.ts';
import { runChexCLI } from '../test-utils/run-chex-cli.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';

interface CheckCase {
  readonly files: Readonly<Record<string, string>>;

  readonly message: string;

  // Files the case writes after the branch commit, so the branch holds an uncommitted change.
  readonly uncommitted: Readonly<Record<string, string>>;

  readonly args: readonly string[];
}

// The repo has an origin and a feature branch, as a pushed branch does, and commitlint installed,
// which git's exclude file keeps out of every commit.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'chex-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const repo = join(directory, 'repo');
  const origin = join(directory, 'upstream.git');

  await $`git init --quiet --bare --initial-branch=main ${origin}`.env({ ...env });
  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(repo).env({ ...env });
  await $`git remote add origin ${origin}`.cwd(repo).env({ ...env });
  await $`git push --quiet -u origin main`.cwd(repo).env({ ...env });
  await $`git switch --quiet -c feature`.cwd(repo).env({ ...env });

  await writeFile(join(repo, '.git/info/exclude'), 'node_modules/\n');
  await linkCommitlint(repo, join(import.meta.dir, '..'));

  return { directory, repo, env, chexBin: getChexE2EPack(process.env).binPath };
}

test.each<[string, CheckCase]>([
  [
    'prose',
    {
      files: { 'README.md': '# Kettle\n\nThe kettle boils water.\n' },
      message: 'docs: add the readme',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'length',
    {
      files: { 'README.md': '- The kettle boils.\n'.repeat(10) },
      message: 'docs: add the readme',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'links',
    {
      files: {
        'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n',
        'guide.md': '# Guide\n',
      },
      message: 'docs: add the guide',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'readmes',
    {
      files: { 'README.md': '# Kettle\n' },
      message: 'docs: add the readme',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'vision',
    {
      files: { 'docs/vision.md': '# Vision\n\nThe kettle boils water for one team.\n' },
      message: 'docs: add the vision',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'skill',
    {
      files: {
        '.claude/skills/kettle/SKILL.md':
          '---\nname: kettle\ndescription: Boils water for the team.\n---\n\n# Kettle\n',
      },
      message: 'docs: add the skill',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'commits',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      message: 'docs: add the notes',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'local-paths',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      message: 'docs: add the notes',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'test-timeouts',
    {
      files: { 'bunfig.toml': '[test]\ntimeout = 5000\n' },
      message: 'test: set the timeout',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'workflows',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      message: 'ci: start the workflows',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'dependency-gates',
    {
      files: { 'package.json': JSON.stringify({ name: 'kettle' }) },
      message: 'build: add the package',
      uncommitted: {},
      args: [],
    },
  ],
  [
    'uncommitted',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      message: 'docs: add the notes',
      uncommitted: {},
      args: [],
    },
  ],
])('it prints cleared and exits 0 when the %s check passes', async (name, check) => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, check.files);
  await commitAllFiles(ctx.repo, ctx.env, check.message);
  await writeTreeFiles(ctx.repo, check.uncommitted);

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, [name, ...check.args]);

  expect({ exitCode: run.exitCode, lastLine: run.lastLine }).toStrictEqual({
    exitCode: 0,
    lastLine: `cleared: ${name}`,
  });
});

test.each<[string, CheckCase, number]>([
  [
    'prose',
    {
      files: { 'README.md': '# Kettle\n\nThe lid is load-bearing.\n' },
      message: 'docs: add the readme',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'length',
    {
      files: { 'README.md': '- The kettle boils.\n'.repeat(101) },
      message: 'docs: add the readme',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'links',
    {
      files: { 'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n' },
      message: 'docs: add the readme',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'readmes',
    {
      files: { 'README.md': '# Kettle\n', 'notes/README.md': '# Notes\n' },
      message: 'docs: add the readmes',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'vision',
    {
      files: { 'README.md': '# Kettle\n' },
      message: 'docs: add the readme',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'skill',
    {
      files: { '.claude/skills/kettle/SKILL.md': '---\nname: kettle\n---\n' },
      message: 'docs: add the skill',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'commits',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      message: 'tidy up',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'test-timeouts',
    {
      files: { 'bunfig.toml': '[test]\ntimeout = 20000\n' },
      message: 'test: raise the timeout',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'workflows',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      message: 'ci: start the workflows',
      uncommitted: {},
      args: ['--profile'],
    },
    2,
  ],
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
      message: 'build: add the package',
      uncommitted: {},
      args: [],
    },
    1,
  ],
  [
    'uncommitted',
    {
      files: { 'notes.txt': 'The kettle boils.\n' },
      message: 'docs: add the notes',
      uncommitted: { 'notes.txt': 'The kettle sings.\n' },
      args: [],
    },
    1,
  ],
])('it prints bounced when the %s check fails', async (name, check, exitCode) => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, check.files);
  await commitAllFiles(ctx.repo, ctx.env, check.message);
  await writeTreeFiles(ctx.repo, check.uncommitted);

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, [name, ...check.args]);

  expect({ exitCode: run.exitCode, lastLine: run.lastLine }).toStrictEqual({
    exitCode,
    lastLine: `bounced: ${name}`,
  });
});

test('it prints bounced when the local-paths check finds a path under the home folder', async () => {
  const ctx = await setupTest();

  const env = { ...ctx.env, HOME: '/home/kettle-cook' };

  await writeTreeFiles(ctx.repo, { 'notes.txt': 'cache: /home/kettle-cook/.cache\n' });
  await commitAllFiles(ctx.repo, env, 'docs: add the notes');

  const run = await runChexCLI(ctx.chexBin, ctx.repo, env, ['local-paths']);

  expect({ exitCode: run.exitCode, lastLine: run.lastLine }).toStrictEqual({
    exitCode: 1,
    lastLine: 'bounced: local-paths',
  });
});

test.each([['prose'], ['length'], ['links'], ['readmes'], ['skill']])(
  'it prints bounced and exits 2 when the %s check runs outside a git work tree',
  async (name) => {
    const ctx = await setupTest();

    await writeTreeFiles(ctx.directory, { 'README.md': '# Kettle\n' });

    const run = await runChexCLI(ctx.chexBin, ctx.directory, ctx.env, [name]);

    expect({ exitCode: run.exitCode, stderr: run.stderr, lastLine: run.lastLine }).toStrictEqual({
      exitCode: 2,
      stderr: `check-${name}: run it inside a git work tree, because it lists the files with git\n`,
      lastLine: `bounced: ${name}`,
    });
  },
);

test('it writes lefthook.yml and the check:docs script to disk for init', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    'package.json': JSON.stringify({
      name: 'kettle',
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    }),
  });

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['init']);
  const lefthook = await Bun.file(join(ctx.repo, 'lefthook.yml')).text();
  const packageJSON: unknown = await Bun.file(join(ctx.repo, 'package.json')).json();

  expect(run.exitCode).toBe(0);
  expect(lefthook).toBe('extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n');

  expect(packageJSON).toStrictEqual({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    scripts: { 'check:docs': 'chex prose length links' },
  });
});

test('it prints each check of a list on its own line and exits 1 when one bounces', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, { 'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n' });
  await commitAllFiles(ctx.repo, ctx.env, 'docs: add the readme');

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['length', 'links']);

  expect({ exitCode: run.exitCode, stdout: run.stdout }).toStrictEqual({
    exitCode: 1,
    stdout: expect.stringMatching(/cleared: length\n[\s\S]*bounced: links\n$/u),
  });
});

test('it exits 2 with the usage on an unknown check', async () => {
  const ctx = await setupTest();
  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['spelling']);

  expect({ exitCode: run.exitCode, stdout: run.stdout, stderr: run.stderr }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr:
      'chex: unknown check "spelling"\n' +
      'usage: chex <check>... | chex <check> [args...] | chex init\n' +
      'checks: prose, length, links, readmes, vision, skill, commits, local-paths, test-timeouts, workflows, dependency-gates, uncommitted\n',
  });
});
