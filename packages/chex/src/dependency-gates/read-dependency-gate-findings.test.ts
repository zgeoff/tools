import { expect, mock, test } from 'bun:test';
import { server } from '@zgeoff/tools-scripts/test-utils/mocks/node';
import { HttpResponse, http } from 'msw';
import type { ProgramResult } from '../program/run-program.ts';
import { buildStubProgramRunner } from '../test-utils/build-stub-program-runner.ts';
import { readDependencyGateFindings } from './read-dependency-gate-findings.ts';

test('it passes a repo with no override, exclude or audit ignore, and runs no audit', async () => {
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'kettle', scripts: { test: 'bun test' } }),
  };

  const findings = await readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    nowMs: Date.parse('2026-03-09T12:00:00Z'),
    runProgram,
    readRepoFile: (path) => files[path] ?? null,
  });

  expect(findings).toStrictEqual([]);
  expect(runProgram).not.toHaveBeenCalled();
});

test('it reports a stale exclude, an unneeded override and an unneeded audit ignore, each with its file', async () => {
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

  const files: Record<string, string> = {
    'bunfig.toml': [
      '[install]',
      '# left-pad 1.3.1 (published 2026-03-01, patches GHSA-aaaa-bbbb-cccc) ages past the gate ~2026-03-08 — remove then (audit-fix)',
      'minimumReleaseAgeExcludes = ["left-pad"]',
    ].join('\n'),
    'package.json': JSON.stringify({
      workspaces: { packages: ['packages/*'], catalog: {} },
      scripts: { audit: 'bun audit --ignore=GHSA-aaaa-bbbb-cccc' },
      overrides: { 'left-pad': '1.3.1' },
    }),
    'bun.lock': `{
      "lockfileVersion": 1,
      "workspaces": { "": { "name": "kettle", "dependencies": { "pad-tools": "2.0.0" } } },
      "packages": {
        "pad-tools": ["pad-tools@2.0.0", "", { "dependencies": { "left-pad": "^1.3.0" } }, "sha512-x"],
      },
    }`,
  };

  const findings = await readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    nowMs: Date.parse('2026-03-09T12:00:00Z'),
    runProgram: buildStubProgramRunner(answers),
    readRepoFile: (path) => files[path] ?? null,
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
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      dependencies: { 'left-pad': '^1.0.0' },
      overrides: { 'left-pad': '2.0.0' },
    }),
    'bun.lock': `{
      "lockfileVersion": 1,
      "workspaces": { "": { "name": "kettle", "dependencies": { "left-pad": "^1.0.0" } } },
      "packages": {
        "left-pad": ["left-pad@2.0.0", "", {}, "sha512-y"],
      },
    }`,
  };

  const findings = await readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    nowMs: Date.parse('2026-03-09T12:00:00Z'),
    runProgram,
    readRepoFile: (path) => files[path] ?? null,
  });

  expect(findings).toStrictEqual([]);
});

test('it keeps a nested override whose parent is a workspace that the range excludes', async () => {
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      workspaces: { packages: ['packages/*'] },
      overrides: { '@acme/spout>left-pad': '2.0.0' },
    }),
    'bun.lock': `{
      "lockfileVersion": 1,
      "workspaces": {
        "": { "name": "kettle" },
        "packages/spout": { "name": "@acme/spout", "dependencies": { "left-pad": "^1.0.0" } },
      },
      "packages": {
        "left-pad": ["left-pad@2.0.0", "", {}, "sha512-y"],
      },
    }`,
  };

  const findings = await readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    nowMs: Date.parse('2026-03-09T12:00:00Z'),
    runProgram,
    readRepoFile: (path) => files[path] ?? null,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports a first-party package in bun.lock that bunfig.toml does not exclude', async () => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'kettle', dependencies: { '@zgeoff/chex': '0.0.5' } }),
    'bunfig.toml': [
      '[install]',
      'minimumReleaseAge = 604800',
      'minimumReleaseAgeExcludes = ["@zgeoff/chex"]',
    ].join('\n'),
    'bun.lock': `{
      "lockfileVersion": 1,
      "workspaces": { "": { "name": "kettle", "dependencies": { "@zgeoff/chex": "0.0.5" } } },
      "packages": {
        "@zgeoff/chex": ["@zgeoff/chex@0.0.5", "", { "dependencies": { "@zgeoff/std": "0.4.0" } }, "sha512-a"],
        "@zgeoff/std": ["@zgeoff/std@0.4.0", "", {}, "sha512-b"],
      },
    }`,
  };

  const findings = await readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    nowMs: Date.parse('2026-03-09T12:00:00Z'),
    runProgram: mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' })),
    readRepoFile: (path) => files[path] ?? null,
  });

  expect(findings).toStrictEqual([
    {
      path: 'bunfig.toml',
      entry: '@zgeoff/std',
      problem:
        'the first-party package has no age-gate exclude, so bun install refuses each release younger than the gate',
    },
  ]);
});

test('it fails a repo with no package.json', () => {
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  expect(
    readDependencyGateFindings({
      cwd: '/repo',
      env: {},
      today: '2026-03-09',
      nowMs: Date.parse('2026-03-09T12:00:00Z'),
      runProgram,
      readRepoFile: () => null,
    }),
  ).rejects.toThrowWithMessage(Error, 'the repo has no package.json');
});

test('it fails a repo that overrides a package and has no bun.lock', () => {
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({ overrides: { 'left-pad': '1.3.1' } }),
  };

  expect(
    readDependencyGateFindings({
      cwd: '/repo',
      env: {},
      today: '2026-03-09',
      nowMs: Date.parse('2026-03-09T12:00:00Z'),
      runProgram,
      readRepoFile: (path) => files[path] ?? null,
    }),
  ).rejects.toThrowWithMessage(Error, 'package.json sets overrides, and the repo has no bun.lock');
});

test('it fails when bun audit prints nothing', () => {
  const runProgram = mock(() => ({
    exitCode: 1,
    stdout: '',
    stderr: 'error: could not reach the registry',
  }));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      scripts: { audit: 'bun audit --ignore=GHSA-aaaa-bbbb-cccc' },
    }),
  };

  expect(
    readDependencyGateFindings({
      cwd: '/repo',
      env: {},
      today: '2026-03-09',
      nowMs: Date.parse('2026-03-09T12:00:00Z'),
      runProgram,
      readRepoFile: (path) => files[path] ?? null,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'bun audit --json printed nothing and exited 1: error: could not reach the registry',
  );
});

test('it reports a young release that bun.lock pins under an age gate, with the file bun.lock', async () => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'kettle', dependencies: { 'left-pad': '1.3.1' } }),
    'bunfig.toml': ['[install]', 'minimumReleaseAge = 604800'].join('\n'),
    'bun.lock': `{
      "lockfileVersion": 1,
      "workspaces": { "": { "name": "kettle", "dependencies": { "left-pad": "1.3.1" } } },
      "packages": {
        "left-pad": ["left-pad@1.3.1", "", {}, "sha512-x"],
      },
    }`,
  };

  server.use(
    http.get('https://registry.npmjs.org/left-pad', () =>
      HttpResponse.json({ time: { '1.3.1': '2026-03-08T20:00:00.000Z' } }),
    ),
  );

  const findings = await readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    nowMs: Date.parse('2026-03-09T12:00:00Z'),
    runProgram: mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' })),
    readRepoFile: (path) => files[path] ?? null,
  });

  expect(findings.map((finding) => ({ path: finding.path, entry: finding.entry }))).toStrictEqual([
    { path: 'bun.lock', entry: 'left-pad@1.3.1' },
  ]);
});
