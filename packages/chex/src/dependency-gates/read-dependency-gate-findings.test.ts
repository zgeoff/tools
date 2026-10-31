import { expect, mock, test } from 'bun:test';
import { buildStubProgramRunner } from '../../../../test-utils/build-stub-program-runner.ts';
import type { ProgramResult } from '../run-program.ts';
import { readDependencyGateFindings } from './read-dependency-gate-findings.ts';

test('it passes a repo with no override, exclude or audit ignore, and runs no audit', () => {
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'kettle', scripts: { test: 'bun test' } }),
  };

  const findings = readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    runProgram,
    readRepoFile: (path) => files[path] ?? null,
  });

  expect(findings).toStrictEqual([]);
  expect(runProgram).not.toHaveBeenCalled();
});

test('it reports a stale exclude, an unneeded override and an unneeded audit ignore, each with its file', () => {
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

  const findings = readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
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

test("it keeps an override of a workspace's own dependency that the workspace's range excludes", () => {
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

  const findings = readDependencyGateFindings({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    runProgram,
    readRepoFile: (path) => files[path] ?? null,
  });

  expect(findings).toStrictEqual([]);
});

test('it fails a repo with no package.json', () => {
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  expect(() =>
    readDependencyGateFindings({
      cwd: '/repo',
      env: {},
      today: '2026-03-09',
      runProgram,
      readRepoFile: () => null,
    }),
  ).toThrowWithMessage(Error, 'the repo has no package.json');
});

test('it fails a repo that overrides a package and has no bun.lock', () => {
  const runProgram = mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' }));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({ overrides: { 'left-pad': '1.3.1' } }),
  };

  expect(() =>
    readDependencyGateFindings({
      cwd: '/repo',
      env: {},
      today: '2026-03-09',
      runProgram,
      readRepoFile: (path) => files[path] ?? null,
    }),
  ).toThrowWithMessage(Error, 'package.json sets overrides, and the repo has no bun.lock');
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

  expect(() =>
    readDependencyGateFindings({
      cwd: '/repo',
      env: {},
      today: '2026-03-09',
      runProgram,
      readRepoFile: (path) => files[path] ?? null,
    }),
  ).toThrowWithMessage(
    Error,
    'bun audit --json printed nothing and exited 1: error: could not reach the registry',
  );
});
