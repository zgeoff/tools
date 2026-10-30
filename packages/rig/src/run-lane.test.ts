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

  const browserHooks: LaneHooks = {
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

  const exitCode = await runLane(lane, ['--bail'], ctx.run, ctx.deps);

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

  await runLane(lane, [], ctx.run, ctx.deps);

  expect(ctx.runCommand.mock.calls[0]?.[0].slice(-3)).toStrictEqual([
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

  const exitCode = await runLane(lane, [], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the e2e lane has no tests\n');
  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it runs the browser lane through its built-in hooks, with the lane memory and the run ID', async () => {
  const ctx = setupTest();
  const lane = ctx.findLane('browser');

  if (lane === undefined) {
    throw new Error('the config holds no browser lane');
  }

  const exitCode = await runLane(lane, [], ctx.run, ctx.deps);

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
