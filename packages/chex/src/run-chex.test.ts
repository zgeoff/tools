import { expect, test } from 'bun:test';
import type { CheckName } from './check-names.ts';
import type { ChexDeps } from './run-chex.ts';
import { runChex } from './run-chex.ts';

function setupTest(exitCodes: Partial<Record<CheckName, number>> = {}) {
  const lines: string[] = [];
  const calls: string[] = [];

  const deps: ChexDeps = {
    runCheck: (name, args) => {
      calls.push([name, ...args].join(' '));

      return Promise.resolve(exitCodes[name] ?? 0);
    },
    runInit: () => {
      calls.push('init');

      return Promise.resolve(0);
    },
    writeOutput: (text) => {
      lines.push(`out ${text}`);
    },
    writeError: (text) => {
      lines.push(`err ${text}`);
    },
  };

  return { deps, lines, calls };
}

test('it prints cleared with the name of each check that passes', async () => {
  const ctx = setupTest();

  const exitCode = await runChex(['length', 'links'], ctx.deps);

  expect({ exitCode, lines: ctx.lines, calls: ctx.calls }).toStrictEqual({
    exitCode: 0,
    lines: ['out cleared: length\n', 'out cleared: links\n'],
    calls: ['length', 'links'],
  });
});

test('it prints bounced for a failed check, runs the checks after it, and exits 1', async () => {
  const ctx = setupTest({ prose: 1 });

  const exitCode = await runChex(['prose', 'vision'], ctx.deps);

  expect({ exitCode, lines: ctx.lines, calls: ctx.calls }).toStrictEqual({
    exitCode: 1,
    lines: ['out bounced: prose\n', 'out cleared: vision\n'],
    calls: ['prose', 'vision'],
  });
});

test('it exits 2 when a check cannot run, and prints bounced', async () => {
  const ctx = setupTest({ commits: 2, 'local-paths': 1 });

  const exitCode = await runChex(['commits', 'local-paths'], ctx.deps);

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 2,
    lines: ['out bounced: commits\n', 'out bounced: local-paths\n'],
  });
});

test('it hands the arguments to the one check it names', async () => {
  const ctx = setupTest();

  const exitCode = await runChex(['workflows', '.github/workflows/pr.yml'], ctx.deps);

  expect({ exitCode, calls: ctx.calls }).toStrictEqual({
    exitCode: 0,
    calls: ['workflows .github/workflows/pr.yml'],
  });
});

test('it runs init for the init command and prints no check line', async () => {
  const ctx = setupTest();

  const exitCode = await runChex(['init'], ctx.deps);

  expect({ exitCode, lines: ctx.lines, calls: ctx.calls }).toStrictEqual({
    exitCode: 0,
    lines: [],
    calls: ['init'],
  });
});

test('it exits 2 with the usage and runs nothing for an unknown check', async () => {
  const ctx = setupTest();

  const exitCode = await runChex(['spelling'], ctx.deps);

  expect({ exitCode, lines: ctx.lines, calls: ctx.calls }).toStrictEqual({
    exitCode: 2,
    lines: [
      'err chex: unknown check "spelling"\n' +
        'usage: chex <check>... | chex <check> [args...] | chex init\n' +
        'checks: prose, length, links, readmes, vision, skill, commits, local-paths, test-timeouts, workflows, dependency-gates, uncommitted\n',
    ],
    calls: [],
  });
});
