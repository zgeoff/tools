import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import type { ProgramResult } from '../run-program.ts';
import { runDependencyGatesCheck } from './run-dependency-gates-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-dependency-gates-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, env: { PATH: process.env['PATH'], HOME: directory } };
}

test('it passes a repo with no override, exclude or audit ignore, and runs no audit', async () => {
  const ctx = await setupTest();

  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: 'kettle', scripts: { test: 'bun test' } }),
  );

  const findings = runDependencyGatesCheck({
    cwd: ctx.directory,
    env: ctx.env,
    today: '2026-03-09',
    runProgram,
  });

  expect(findings).toStrictEqual([]);
  expect(runProgram).not.toHaveBeenCalled();
});

test('it reports a stale exclude, an unneeded override and an unneeded audit ignore, each with its file', async () => {
  const ctx = await setupTest();

  const answers: Record<string, ProgramResult> = {
    'bun audit --json': {
      exitCode: 1,
      stdout: JSON.stringify({
        'right-pad': [{ id: 1_100_300, url: 'https://github.com/advisories/GHSA-dddd-eeee-ffff' }],
      }),
      stderr: '',
    },
    'bun audit fix --dry-run --json': {
      exitCode: 0,
      stdout: JSON.stringify({ dryRun: true, fixes: [], blocked: [], unfixable: [] }),
      stderr: '',
    },
  };

  await writeFile(
    join(ctx.directory, 'bunfig.toml'),
    [
      '[install]',
      '# left-pad 1.3.1 (published 2026-03-01, patches GHSA-aaaa-bbbb-cccc) ages past the gate ~2026-03-08 — remove then (audit-fix)',
      'minimumReleaseAgeExcludes = ["left-pad"]',
    ].join('\n'),
  );

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      workspaces: { packages: ['packages/*'], catalog: {} },
      scripts: { audit: 'bun audit --ignore=GHSA-aaaa-bbbb-cccc' },
      overrides: { 'left-pad': '1.3.1' },
    }),
  );

  await writeFile(
    join(ctx.directory, 'bun.lock'),
    `{
      "lockfileVersion": 1,
      "workspaces": { "": { "name": "kettle", "dependencies": { "pad-tools": "2.0.0" } } },
      "packages": {
        "pad-tools": ["pad-tools@2.0.0", "", { "dependencies": { "left-pad": "^1.3.0" } }, "sha512-x"],
      },
    }`,
  );

  const findings = runDependencyGatesCheck({
    cwd: ctx.directory,
    env: ctx.env,
    today: '2026-03-09',
    runProgram: (argv) => {
      const answer = answers[argv.join(' ')];

      invariant(answer, `the test has no answer for ${argv.join(' ')}`);

      return answer;
    },
  });

  expect(findings).toStrictEqual([
    {
      path: 'bunfig.toml',
      entry: 'left-pad',
      problem: 'the age-gate exclude was due for removal on 2026-03-08',
    },
    {
      path: 'package.json',
      entry: 'left-pad',
      problem: 'every range in bun.lock already admits 1.3.1, so the override changes nothing',
    },
    {
      path: 'package.json',
      entry: 'GHSA-aaaa-bbbb-cccc',
      problem: 'no locked package has the ignored advisory',
    },
  ]);
});

test("it keeps an override of a workspace's own dependency that the workspace's range excludes", async () => {
  const ctx = await setupTest();

  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ dependencies: { 'left-pad': '^1.0.0' }, overrides: { 'left-pad': '2.0.0' } }),
  );

  await writeFile(
    join(ctx.directory, 'bun.lock'),
    `{
      "lockfileVersion": 1,
      "workspaces": { "": { "name": "kettle", "dependencies": { "left-pad": "^1.0.0" } } },
      "packages": {
        "left-pad": ["left-pad@2.0.0", "", {}, "sha512-y"],
      },
    }`,
  );

  const findings = runDependencyGatesCheck({
    cwd: ctx.directory,
    env: ctx.env,
    today: '2026-03-09',
    runProgram,
  });

  expect(findings).toStrictEqual([]);
});

test('it fails a repo that overrides a package and has no bun.lock', async () => {
  const ctx = await setupTest();

  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ overrides: { 'left-pad': '1.3.1' } }),
  );

  expect(() =>
    runDependencyGatesCheck({ cwd: ctx.directory, env: ctx.env, today: '2026-03-09', runProgram }),
  ).toThrowWithMessage(Error, /^cannot read bun\.lock: ENOENT/u);
});

test('it fails when bun audit prints nothing', async () => {
  const ctx = await setupTest();

  const runProgram = mock(() => ({
    exitCode: 1,
    stdout: '',
    stderr: 'error: could not reach the registry',
  }));

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { audit: 'bun audit --ignore=GHSA-aaaa-bbbb-cccc' } }),
  );

  expect(() =>
    runDependencyGatesCheck({ cwd: ctx.directory, env: ctx.env, today: '2026-03-09', runProgram }),
  ).toThrowWithMessage(
    Error,
    'bun audit --json printed nothing and exited 1: error: could not reach the registry',
  );
});

test('it exits 0 and prints nothing when run in a repo with no override, exclude or audit ignore', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), JSON.stringify({ name: 'kettle' }));

  const result = await $`bun ${join(import.meta.dir, 'run-dependency-gates-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it exits 1 and prints each finding with its file when run in a repo with a stale exclude', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), JSON.stringify({ name: 'kettle' }));

  await writeFile(
    join(ctx.directory, 'bunfig.toml'),
    [
      '[install]',
      '# left-pad 1.3.1 (published 2020-03-01, patches GHSA-aaaa-bbbb-cccc) ages past the gate ~2020-03-08 — remove then (audit-fix)',
      'minimumReleaseAgeExcludes = ["left-pad"]',
    ].join('\n'),
  );

  const result = await $`bun ${join(import.meta.dir, 'run-dependency-gates-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: 'bunfig.toml: left-pad: the age-gate exclude was due for removal on 2020-03-08\n',
    stderr: '',
  });
});

test('it exits 2 with the reason when run in a repo whose package.json holds no object', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), '[]');

  const result = await $`bun ${join(import.meta.dir, 'run-dependency-gates-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'dependency-gates: package.json holds no object\n',
  });
});
