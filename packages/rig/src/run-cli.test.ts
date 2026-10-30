import { expect, mock, test } from 'bun:test';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { defineRig } from './define-rig.ts';
import { runCLI } from './run-cli.ts';
import type { CommandOptions } from './run-command.ts';

function setupTest() {
  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };
  const trackedFiles: string[] = [];

  return {
    runCommand,
    trackedFiles,
    output,
    run: {
      repoRoot: '/repo',
      environment: {},
      signal: new AbortController().signal,
      runID: '4417',
    },
    deps: {
      dietScript: '/diet.sh',
      output,
      sources: { cwd: '/repo', probeFile: () => true },
      readConfig: () => Promise.resolve(defineRig({ lanes: { kiln: { limit: '15s' } } })),
      readTrackedFiles: () => Promise.resolve(trackedFiles),
      initFiles: {
        readJSON: () => Promise.reject(new Error('no init here')),
        writeText: () => Promise.reject(new Error('no init here')),
        probeFile: () => Promise.reject(new Error('no init here')),
      },
      readWorkerCount: () => Promise.resolve({ kind: 'count' as const, count: 2 }),
      importModule: () => Promise.resolve({}),
      runCommand,
      wireBrowserLaneHooks: () => Promise.reject(new Error('no browser lane here')),
    },
  };
}

test('it runs the unit lane for rig unit, with the paths after it', async () => {
  const ctx = setupTest();

  ctx.trackedFiles.push('src/a.test.ts');

  const exitCode = await runCLI(['unit', './src/a.test.ts'], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    '--randomize',
    '--path-ignore-patterns=**/*.kiln.test.ts',
    './src/a.test.ts',
  ]);
});

test('it passes a flag after rig unit on to bun test', async () => {
  const ctx = setupTest();

  const exitCode = await runCLI(['unit', '--seed=1'], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.runCommand.mock.calls[0]?.[0]).toContain('--seed=1');
});

test.each([
  ['unit', '--timeout=90000', ['--timeout=90000']],
  ['kiln', '--timeout=90000', ['--bail', '--timeout=90000']],
  ['browser', '--timeout', ['--timeout', '90000']],
])(
  'it exits 2 and runs nothing for rig %s given %s, because the lane limit lives in the config',
  async (command, timeoutArg, extraArgs) => {
    const ctx = setupTest();

    ctx.trackedFiles.push('src/a.test.ts', 'src/a.kiln.test.ts', 'src/a.browser.test.ts');

    const exitCode = await runCLI([command, ...extraArgs], ctx.run, ctx.deps);

    expect(exitCode).toBe(2);

    expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
      `rig: rig ${command} refuses ${timeoutArg}, because the lane limit lives in rig.config.ts\n`,
    );

    expect(ctx.runCommand).not.toHaveBeenCalled();
  },
);

test('it runs a lane that the config declares for rig <lane>', async () => {
  const ctx = setupTest();

  const exitCode = await runCLI(['kiln'], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    '--timeout=15000',
    '.kiln.test.ts',
  ]);
});

test('it runs the related tests for rig related', async () => {
  const ctx = setupTest();

  const exitCode = await runCLI(['related', 'src/a.ts'], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.runCommand.mock.calls[0]?.[0]).toContain('./src/a.test.ts');
});

test('it exits 2 and names the commands for a command it does not know', async () => {
  const ctx = setupTest();

  const exitCode = await runCLI(['kilm'], ctx.run, ctx.deps);

  expect(exitCode).toBe(2);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig: unknown command "kilm"; use one of init, related, unit, e2e, browser, docker, host, agent-sdk, model-api, kiln\n',
  );

  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it exits 2 with the parser message for a command line it refuses', async () => {
  const ctx = setupTest();

  const exitCode = await runCLI([], ctx.run, ctx.deps);

  expect(exitCode).toBe(2);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    "rig: Positional argument 'command' is required\n",
  );
});
