import { expect, mock, test } from 'bun:test';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import type { BrowserLaneWiring } from './browser/wire-browser-lane-hooks.ts';
import { defineRig } from './define-rig.ts';
import type { LaneHooks } from './lane-hooks.ts';
import type { CommandOptions } from './run-command.ts';
import { runLane } from './run-lane.ts';

function setupTest(trackedFiles: readonly string[] = []) {
  const config = defineRig({
    lanes: { kiln: { limit: '15s', memory: '8G', start: 'test-utils/start-kiln.ts' } },
  });

  const signal = new AbortController().signal;

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const browserHooks = {
    start: mock<LaneHooks['start']>(() => Promise.resolve({ kind: 'proceed', environment: {} })),
    run: mock<LaneHooks['run']>(() => Promise.resolve(5)),
    stop: mock<LaneHooks['stop']>(() => Promise.resolve()),
  };

  const wireBrowserLaneHooks = mock<(wiring: BrowserLaneWiring) => Promise<LaneHooks>>(() =>
    Promise.resolve(browserHooks),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  const startKiln = mock(() =>
    Promise.resolve({ environment: { KILN_URL: 'http://localhost:7001' } }),
  );

  return {
    config,
    runCommand,
    output,
    browserHooks,
    wireBrowserLaneHooks,
    startKiln,
    signal,
    run: { repoRoot: '/repo', environment: { PATH: '/usr/bin' }, signal, runID: '4417' },
    findLane: (name: string) => config.lanes.find((lane) => lane.name === name),
    deps: {
      dietScript: '/diet.sh',
      output,
      readTrackedFiles: () => Promise.resolve(trackedFiles),
      importModule: () => Promise.resolve({ default: startKiln }),
      runCommand,
      wireBrowserLaneHooks,
    },
  };
}

test('it runs a repo lane under diet with its limit, its suffix filter and the start hook environment', async () => {
  const ctx = setupTest();
  const lane = ctx.findLane('kiln');

  if (lane === undefined) {
    throw new Error('the config holds no kiln lane');
  }

  const exitCode = await runLane(
    { config: ctx.config, lane, extraArgs: ['--bail'] },
    ctx.run,
    ctx.deps,
  );

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
      '.kiln.test.tsx',
      '--bail',
    ],
    {
      cwd: '/repo',
      environment: { PATH: '/usr/bin', KILN_URL: 'http://localhost:7001' },
      signal: ctx.signal,
    },
  );
});

test('it runs the e2e lane on the e2e folders that git tracks', async () => {
  const ctx = setupTest([
    'e2e/login.test.ts',
    'apps/shop/package.json',
    'apps/shop/e2e/cart.test.ts',
  ]);

  const lane = ctx.findLane('e2e');

  if (lane === undefined) {
    throw new Error('the config holds no e2e lane');
  }

  await runLane({ config: ctx.config, lane, extraArgs: [] }, ctx.run, ctx.deps);

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    '--timeout=15000',
    './apps/shop/e2e/',
    './e2e/',
  ]);
});

test('it says so and exits 0 for the e2e lane of a repo with no e2e folder', async () => {
  const ctx = setupTest(['src/a.test.ts']);
  const lane = ctx.findLane('e2e');

  if (lane === undefined) {
    throw new Error('the config holds no e2e lane');
  }

  const exitCode = await runLane({ config: ctx.config, lane, extraArgs: [] }, ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the e2e lane has no tests\n');
  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it runs only the lane files that a path selects, in place of the suffix filter', async () => {
  const ctx = setupTest(['pkg/src/fire.kiln.test.ts', 'pkg/src/fire.test.ts', 'pkg/src/fire.ts']);
  const lane = ctx.findLane('kiln');

  if (lane === undefined) {
    throw new Error('the config holds no kiln lane');
  }

  await runLane(
    { config: ctx.config, lane, extraArgs: ['./pkg/src', '--seed=1'] },
    ctx.run,
    ctx.deps,
  );

  expect(ctx.runCommand.mock.calls[0]?.[0]).toStrictEqual([
    'bash',
    '/diet.sh',
    '--budget',
    '8G',
    '--',
    'bun',
    'test',
    '--parallel=1',
    '--timeout=15000',
    './pkg/src/fire.kiln.test.ts',
    '--seed=1',
  ]);
});

test('it runs a lane with a suffix and no paths without the git file list, as outside a git repo', async () => {
  const ctx = setupTest();
  const lane = ctx.findLane('kiln');

  if (lane === undefined) {
    throw new Error('the config holds no kiln lane');
  }

  const exitCode = await runLane({ config: ctx.config, lane, extraArgs: ['--seed=1'] }, ctx.run, {
    ...ctx.deps,
    readTrackedFiles: () => Promise.reject(new Error('not a git repository')),
  });

  expect(exitCode).toBe(0);
  expect(ctx.runCommand).toHaveBeenCalledOnce();
});

test('it names the paths and exits 1 when they select none of the lane files', async () => {
  const ctx = setupTest(['pkg/src/fire.kiln.test.ts', 'pkg/src/fire.test.ts']);
  const lane = ctx.findLane('kiln');

  if (lane === undefined) {
    throw new Error('the config holds no kiln lane');
  }

  const exitCode = await runLane(
    { config: ctx.config, lane, extraArgs: ['./pkg/src/fire.test.ts'] },
    ctx.run,
    ctx.deps,
  );

  expect(exitCode).toBe(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig: the kiln lane has no tests that match ./pkg/src/fire.test.ts\n',
  );

  expect(ctx.runCommand).not.toHaveBeenCalled();
  expect(ctx.startKiln).not.toHaveBeenCalled();
});

test('it runs the browser lane through its built-in hooks, with the lane memory and the run ID', async () => {
  const ctx = setupTest();
  const lane = ctx.findLane('browser');

  if (lane === undefined) {
    throw new Error('the config holds no browser lane');
  }

  const exitCode = await runLane({ config: ctx.config, lane, extraArgs: [] }, ctx.run, ctx.deps);

  expect(exitCode).toBe(5);

  expect(ctx.wireBrowserLaneHooks).toHaveBeenCalledExactlyOnceWith({
    repoRoot: '/repo',
    runID: '4417',
    memory: null,
    dietScript: '/diet.sh',
    environment: { PATH: '/usr/bin' },
    signal: ctx.signal,
  });

  expect(ctx.browserHooks.run).toHaveBeenCalledExactlyOnceWith(
    ['--timeout=10000', '.browser.test.ts', '.browser.test.tsx'],
    {},
  );

  expect(ctx.browserHooks.stop).toHaveBeenCalledTimes(1);
  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it leaves the files of the other lanes out of the e2e run', async () => {
  const ctx = setupTest(['e2e/login.test.ts', 'e2e/live.model-api.test.ts']);
  const lane = ctx.findLane('e2e');

  if (lane === undefined) {
    throw new Error('the config holds no e2e lane');
  }

  await runLane({ config: ctx.config, lane, extraArgs: [] }, ctx.run, ctx.deps);

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    './e2e/',
    '--path-ignore-patterns=**/*.model-api.test.ts',
    '--path-ignore-patterns=**/*.kiln.test.ts',
  ]);
});

test('it exits 1 when a signal arrives while the stop hook cleans up after passing tests', async () => {
  const ctx = setupTest();

  const controller = new AbortController();

  const lane = ctx.findLane('browser');

  if (lane === undefined) {
    throw new Error('the config holds no browser lane');
  }

  ctx.browserHooks.run.mockImplementation(() => Promise.resolve(0));

  ctx.browserHooks.stop.mockImplementation(() => {
    controller.abort();

    return Promise.resolve();
  });

  const exitCode = await runLane(
    { config: ctx.config, lane, extraArgs: [] },
    { ...ctx.run, signal: controller.signal },
    ctx.deps,
  );

  expect(exitCode).toBe(1);
});
