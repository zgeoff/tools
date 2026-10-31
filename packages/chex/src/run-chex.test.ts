import { expect, mock, test } from 'bun:test';
import { buildStubCheckRunner } from '../../../test-utils/build-stub-check-runner.ts';
import { runChex } from './run-chex.ts';

function setupTest() {
  const lines: string[] = [];
  const runInit = mock(() => Promise.resolve(0));

  const writeOutput = (text: string) => {
    lines.push(`out ${text}`);
  };

  const writeError = (text: string) => {
    lines.push(`err ${text}`);
  };

  return { lines, runInit, writeOutput, writeError };
}

test('it prints cleared with the name of each check that passes', async () => {
  const ctx = setupTest();
  const stub = buildStubCheckRunner({ length: 0, links: 0 });

  const exitCode = await runChex(['length', 'links'], { ...ctx, runCheck: stub.runCheck });

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 0,
    lines: ['out cleared: length\n', 'out cleared: links\n'],
  });

  expect(stub.calls).toStrictEqual(['length', 'links']);
});

test('it prints bounced for a failed check, runs the checks after it, and exits 1', async () => {
  const ctx = setupTest();
  const stub = buildStubCheckRunner({ prose: 1, vision: 0 });

  const exitCode = await runChex(['prose', 'vision'], { ...ctx, runCheck: stub.runCheck });

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 1,
    lines: ['out bounced: prose\n', 'out cleared: vision\n'],
  });

  expect(stub.calls).toStrictEqual(['prose', 'vision']);
});

test('it exits 2 when a check cannot run, and prints bounced', async () => {
  const ctx = setupTest();
  const stub = buildStubCheckRunner({ commits: 2, 'local-paths': 1 });

  const exitCode = await runChex(['commits', 'local-paths'], { ...ctx, runCheck: stub.runCheck });

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 2,
    lines: ['out bounced: commits\n', 'out bounced: local-paths\n'],
  });
});

test('it prints bounced and exits 2 for a check that throws, and runs the checks after it', async () => {
  const ctx = setupTest();

  const stub = buildStubCheckRunner({
    length: new Error('Executable not found in $PATH: "bash"'),
    commits: 0,
  });

  const exitCode = await runChex(['length', 'commits'], { ...ctx, runCheck: stub.runCheck });

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 2,
    lines: [
      'err chex: length cannot run: Executable not found in $PATH: "bash"\n',
      'out bounced: length\n',
      'out cleared: commits\n',
    ],
  });

  expect(stub.calls).toStrictEqual(['length', 'commits']);
});

test('it exits 2 and prints bounced for a check that exits with a shell code such as 127', async () => {
  const ctx = setupTest();
  const stub = buildStubCheckRunner({ links: 127 });

  const exitCode = await runChex(['links'], { ...ctx, runCheck: stub.runCheck });

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 2,
    lines: ['out bounced: links\n'],
  });
});

test('it hands the arguments to the one check it names', async () => {
  const ctx = setupTest();
  const stub = buildStubCheckRunner({ workflows: 0 });

  const exitCode = await runChex(['workflows', '.github/workflows/pr.yml'], {
    ...ctx,
    runCheck: stub.runCheck,
  });

  expect(exitCode).toBe(0);
  expect(stub.calls).toStrictEqual(['workflows .github/workflows/pr.yml']);
});

test('it runs init for the init command and prints no check line', async () => {
  const ctx = setupTest();
  const stub = buildStubCheckRunner({});

  const exitCode = await runChex(['init'], { ...ctx, runCheck: stub.runCheck });

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({ exitCode: 0, lines: [] });
  expect(stub.calls).toStrictEqual([]);
  expect(ctx.runInit).toHaveBeenCalledTimes(1);
});

test('it exits 2 with the usage and runs nothing for an unknown check', async () => {
  const ctx = setupTest();
  const stub = buildStubCheckRunner({});

  const exitCode = await runChex(['spelling'], { ...ctx, runCheck: stub.runCheck });

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 2,
    lines: [
      'err chex: unknown check "spelling"\n' +
        'usage: chex <check>... | chex <check> [args...] | chex init\n' +
        'checks: prose, length, links, readmes, vision, skill, commits, local-paths, test-timeouts, workflows, dependency-gates, uncommitted\n',
    ],
  });

  expect(stub.calls).toStrictEqual([]);
});
