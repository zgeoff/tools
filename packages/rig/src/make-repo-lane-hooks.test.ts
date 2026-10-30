import { expect, mock, test } from 'bun:test';
import { makeResolvingStub } from '../../../test-utils/make-resolving-stub.ts';
import { defineRig } from './define-rig.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import type { CommandOptions } from './run-command.ts';

function setupTest(laneDeclaration: Parameters<typeof defineRig>[0]['lanes'] = {}) {
  const config = defineRig({ lanes: { kiln: { limit: '15s' }, ...laneDeclaration } });
  const lane = config.lanes.find((candidate) => candidate.name === 'kiln');

  if (lane === undefined) {
    throw new Error('the config holds no kiln lane');
  }

  const signal = new AbortController().signal;
  const hookModules = new Map<string, unknown>();

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const context = {
    repoRoot: '/repo',
    lane,
    runID: '4417',
    environment: { PATH: '/usr/bin' },
  };

  return {
    hookModules,
    runCommand,
    context,
    hooks: makeRepoLaneHooks({
      context,
      dietScript: '/diet.sh',
      parallel: 1,
      signal,
      importModule: (path) => Promise.resolve(hookModules.get(path)),
      runCommand,
    }),
    signal,
  };
}

test('it starts with the test environment unchanged when the lane has no start hook', async () => {
  const ctx = setupTest();

  const outcome = await ctx.hooks.start();

  expect(outcome).toStrictEqual({ kind: 'proceed', environment: { PATH: '/usr/bin' } });
});

test('it calls the start hook with the lane context and adds the environment it returns', async () => {
  const ctx = setupTest({ kiln: { limit: '15s', start: 'test-utils/start-kiln.ts' } });
  const start = makeResolvingStub({ environment: { KILN_URL: 'http://localhost:7001' } });

  ctx.hookModules.set('/repo/test-utils/start-kiln.ts', { default: start });

  const outcome = await ctx.hooks.start();

  expect(start).toHaveBeenCalledExactlyOnceWith(ctx.context);

  expect(outcome).toStrictEqual({
    kind: 'proceed',
    environment: { PATH: '/usr/bin', KILN_URL: 'http://localhost:7001' },
  });
});

test('it refuses a start module that default-exports no function', async () => {
  const ctx = setupTest({ kiln: { limit: '15s', start: 'test-utils/start-kiln.ts' } });

  ctx.hookModules.set('/repo/test-utils/start-kiln.ts', { default: 'start' });

  await expect(ctx.hooks.start()).rejects.toThrow('test-utils/start-kiln.ts must default-export');
});

test('it runs bun test under diet with the lane budget, one process per file, and the arguments it gets', async () => {
  const ctx = setupTest({ kiln: { limit: '15s', memory: '8G' } });

  const exitCode = await ctx.hooks.run(['--timeout=15000', '.kiln.test.ts'], { KILN_URL: 'x' });

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
  const withStop = setupTest({ kiln: { limit: '15s', stop: 'test-utils/stop-kiln.ts' } });
  const stop = makeResolvingStub(undefined);

  withStop.hookModules.set('/repo/test-utils/stop-kiln.ts', { default: stop });

  await withStop.hooks.stop();

  const withoutStop = setupTest();

  await withoutStop.hooks.stop();

  expect(stop).toHaveBeenCalledExactlyOnceWith(withStop.context);
});
