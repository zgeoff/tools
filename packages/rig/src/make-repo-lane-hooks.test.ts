import { expect, mock, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { makeResolvingStub } from '../../../test-utils/make-resolving-stub.ts';
import { defineRig } from './define-rig.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import type { CommandOptions } from './run-command.ts';

function setupTest() {
  const signal = new AbortController().signal;

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  return { runCommand, signal };
}

test('it starts with the test environment unchanged when the lane has no start hook', async () => {
  const ctx = setupTest();

  const lane = defineRig({ lanes: { kiln: { limit: '15s' } } }).lanes.find(
    (candidate) => candidate.name === 'kiln',
  );

  invariant(lane);

  const hooks = makeRepoLaneHooks({
    context: { repoRoot: '/repo', lane, runID: '4417', environment: { PATH: '/usr/bin' } },
    dietScript: '/diet.sh',
    parallel: 1,
    signal: ctx.signal,
    importModule: () => Promise.resolve(undefined),
    runCommand: ctx.runCommand,
  });

  const outcome = await hooks.start();

  expect(outcome).toStrictEqual({ kind: 'proceed', environment: { PATH: '/usr/bin' } });
});

test('it calls the start hook with the lane context and adds the environment it returns', async () => {
  const ctx = setupTest();

  const lane = defineRig({
    lanes: { kiln: { limit: '15s', start: 'test-utils/start-kiln.ts' } },
  }).lanes.find((candidate) => candidate.name === 'kiln');

  invariant(lane);

  const start = makeResolvingStub({ environment: { KILN_URL: 'http://localhost:7001' } });

  const hookModules = new Map([['/repo/test-utils/start-kiln.ts', { default: start }]]);

  const hooks = makeRepoLaneHooks({
    context: { repoRoot: '/repo', lane, runID: '4417', environment: { PATH: '/usr/bin' } },
    dietScript: '/diet.sh',
    parallel: 1,
    signal: ctx.signal,
    importModule: (path) => Promise.resolve(hookModules.get(path)),
    runCommand: ctx.runCommand,
  });

  const outcome = await hooks.start();

  expect(start).toHaveBeenCalledExactlyOnceWith({
    repoRoot: '/repo',
    lane,
    runID: '4417',
    environment: { PATH: '/usr/bin' },
  });

  expect(outcome).toStrictEqual({
    kind: 'proceed',
    environment: { PATH: '/usr/bin', KILN_URL: 'http://localhost:7001' },
  });
});

test('it refuses a start module that default-exports no function', async () => {
  const ctx = setupTest();

  const lane = defineRig({
    lanes: { kiln: { limit: '15s', start: 'test-utils/start-kiln.ts' } },
  }).lanes.find((candidate) => candidate.name === 'kiln');

  invariant(lane);

  const hookModules = new Map([['/repo/test-utils/start-kiln.ts', { default: 'start' }]]);

  const hooks = makeRepoLaneHooks({
    context: { repoRoot: '/repo', lane, runID: '4417', environment: {} },
    dietScript: '/diet.sh',
    parallel: 1,
    signal: ctx.signal,
    importModule: (path) => Promise.resolve(hookModules.get(path)),
    runCommand: ctx.runCommand,
  });

  const failure = await hooks.start().catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);

  expect(failure).toHaveProperty(
    'message',
    expect.stringContaining('test-utils/start-kiln.ts must default-export'),
  );
});

test('it runs bun test under diet with the lane budget, one process per file, and the arguments it gets', async () => {
  const ctx = setupTest();

  const lane = defineRig({ lanes: { kiln: { limit: '15s', memory: '8G' } } }).lanes.find(
    (candidate) => candidate.name === 'kiln',
  );

  invariant(lane);

  const hooks = makeRepoLaneHooks({
    context: { repoRoot: '/repo', lane, runID: '4417', environment: { PATH: '/usr/bin' } },
    dietScript: '/diet.sh',
    parallel: 1,
    signal: ctx.signal,
    importModule: () => Promise.resolve(undefined),
    runCommand: ctx.runCommand,
  });

  const exitCode = await hooks.run(['--timeout=15000', '.kiln.test.ts'], { KILN_URL: 'x' });

  expect(exitCode).toBe(0);

  expect(ctx.runCommand).toHaveBeenCalledExactlyOnceWith(
    [
      'bash',
      '/diet.sh',
      '--budget',
      '8G',
      '--',
      'bun',
      'test',
      '--parallel=1',
      '--timeout=15000',
      '.kiln.test.ts',
    ],
    { cwd: '/repo', environment: { KILN_URL: 'x' }, signal: ctx.signal },
  );
});

test('it calls the stop hook, and skips it for a lane that has none', async () => {
  const ctx = setupTest();

  const config = defineRig({
    lanes: { kiln: { limit: '15s', stop: 'test-utils/stop-kiln.ts' }, oven: { limit: '15s' } },
  });

  const withStop = config.lanes.find((candidate) => candidate.name === 'kiln');
  const withoutStop = config.lanes.find((candidate) => candidate.name === 'oven');

  invariant(withStop);
  invariant(withoutStop);

  const stop = makeResolvingStub(undefined);

  const hookModules = new Map([['/repo/test-utils/stop-kiln.ts', { default: stop }]]);

  const hookOptions = {
    dietScript: '/diet.sh',
    parallel: 1,
    signal: ctx.signal,
    importModule: (path: string) => Promise.resolve(hookModules.get(path)),
    runCommand: ctx.runCommand,
  };

  await makeRepoLaneHooks({
    ...hookOptions,
    context: {
      repoRoot: '/repo',
      lane: withStop,
      runID: '4417',
      environment: { PATH: '/usr/bin' },
    },
  }).stop();

  await makeRepoLaneHooks({
    ...hookOptions,
    context: {
      repoRoot: '/repo',
      lane: withoutStop,
      runID: '4417',
      environment: { PATH: '/usr/bin' },
    },
  }).stop();

  expect(stop).toHaveBeenCalledExactlyOnceWith({
    repoRoot: '/repo',
    lane: withStop,
    runID: '4417',
    environment: { PATH: '/usr/bin' },
  });
});
