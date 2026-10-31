import { expect, mock, test } from 'bun:test';
import { runDependencyGatesCheck } from './run-dependency-gates-check.ts';

test('it exits 0 and writes nothing for a repo with no override, exclude or audit ignore', () => {
  const output: string[] = [];
  const errors: string[] = [];
  const files: Record<string, string> = { 'package.json': JSON.stringify({ name: 'kettle' }) };

  const exitCode = runDependencyGatesCheck({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    runProgram: mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' })),
    readRepoFile: (path) => files[path] ?? null,
    writeOutput: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      errors.push(text);
    },
  });

  expect(exitCode).toBe(0);
  expect(output).toStrictEqual([]);
  expect(errors).toStrictEqual([]);
});

test('it exits 1 and writes each finding with its file for a repo with a stale exclude', () => {
  const output: string[] = [];
  const errors: string[] = [];

  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'kettle' }),
    'bunfig.toml': [
      '[install]',
      '# left-pad 1.3.1 (published 2026-03-01, patches GHSA-aaaa-bbbb-cccc) ages past the gate ~2026-03-08 — remove then (audit-fix)',
      'minimumReleaseAgeExcludes = ["left-pad"]',
    ].join('\n'),
  };

  const exitCode = runDependencyGatesCheck({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    runProgram: mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' })),
    readRepoFile: (path) => files[path] ?? null,
    writeOutput: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      errors.push(text);
    },
  });

  expect(exitCode).toBe(1);

  expect(output).toStrictEqual([
    'bunfig.toml: left-pad: the age-gate exclude was due for removal on 2026-03-08\n',
  ]);

  expect(errors).toStrictEqual([]);
});

test('it exits 2 and writes the reason for a repo whose package.json holds no object', () => {
  const output: string[] = [];
  const errors: string[] = [];
  const files: Record<string, string> = { 'package.json': '[]' };

  const exitCode = runDependencyGatesCheck({
    cwd: '/repo',
    env: {},
    today: '2026-03-09',
    runProgram: mock(() => ({ exitCode: 0, stdout: '{}', stderr: '' })),
    readRepoFile: (path) => files[path] ?? null,
    writeOutput: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      errors.push(text);
    },
  });

  expect(exitCode).toBe(2);
  expect(output).toStrictEqual([]);
  expect(errors).toStrictEqual(['dependency-gates: package.json holds no object\n']);
});
