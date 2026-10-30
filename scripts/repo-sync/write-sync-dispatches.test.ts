import { expect, test } from 'bun:test';
import type { CommandResult } from '../ci/run-command.ts';
import { writeSyncDispatches } from './write-sync-dispatches.ts';

function setupTest(refused: readonly string[] = []) {
  const calls: string[][] = [];
  const output: string[] = [];

  const run = (argv: readonly string[]): Promise<CommandResult> => {
    calls.push([...argv]);

    if (argv.includes('installation/repositories')) {
      return Promise.resolve({
        exitCode: 0,
        stdout: 'example/web\nexample/tools\nexample/api\n',
        stderr: '',
      });
    }

    const refusedRepo = refused.find((repo) => argv.includes(`repos/${repo}/dispatches`));

    const result =
      refusedRepo === undefined
        ? { exitCode: 0, stdout: '', stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' };

    return Promise.resolve(result);
  };

  const dispatch = (dispatchCommit = '3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e') =>
    writeSyncDispatches({
      cwd: '.',
      env: {},
      commit: dispatchCommit,
      repo: 'example/tools',
      runCommand: run,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { calls, output, dispatch };
}

test('it sends the commit to every repo of the sync App but this one', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.dispatch();

  expect(exitCode).toBe(0);

  expect(ctx.calls.slice(1)).toStrictEqual(
    ['example/api', 'example/web'].map((repo) => [
      'gh',
      'api',
      '--silent',
      `repos/${repo}/dispatches`,
      '-f',
      'event_type=zgeoff-tools-sync',
      '-f',
      'client_payload[sha]=3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
    ]),
  );
});

test('it sends to the other repos and then fails when one refuses the dispatch', async () => {
  const ctx = setupTest(['example/api']);

  const exitCode = await ctx.dispatch();

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    '::error::example/api refused the dispatch: gh: Not Found (HTTP 404)\n',
    'Dispatched 3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e to example/web.\n',
  ]);
});

test('it refuses a commit that is not a full commit ID and sends nothing', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.dispatch('main');

  expect(exitCode).toBe(1);
  expect(ctx.calls).toStrictEqual([]);
  expect(ctx.output).toStrictEqual(["::error::'main' is not a full commit ID\n"]);
});
