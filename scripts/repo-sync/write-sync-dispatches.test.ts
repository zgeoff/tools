import { expect, test } from 'bun:test';
import { buildCommandStub } from '../../test-utils/build-command-stub.ts';
import { writeSyncDispatches } from './write-sync-dispatches.ts';

function setupTest() {
  const commands = buildCommandStub();
  const output: string[] = [];

  const dispatch = (commit: string) =>
    writeSyncDispatches({
      cwd: '.',
      env: {},
      commit,
      repo: 'example/tools',
      runCommand: commands.runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { commands, output, dispatch };
}

test('it sends the commit to every repo of the sync App but this one', async () => {
  const ctx = setupTest();

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--paginate',
      'installation/repositories',
      '--jq',
      '.repositories[] | select(.archived | not) | .full_name',
    ],
    { exitCode: 0, stdout: 'example/web\nexample/tools\nexample/api\n', stderr: '' },
  );

  for (const repo of ['example/api', 'example/web']) {
    ctx.commands.answer(
      [
        'gh',
        'api',
        '--silent',
        `repos/${repo}/dispatches`,
        '-f',
        'event_type=zgeoff-tools-sync',
        '-f',
        'client_payload[sha]=3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
      ],
      { exitCode: 0, stdout: '', stderr: '' },
    );
  }

  const exitCode = await ctx.dispatch('3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e');

  expect(exitCode).toBe(0);

  expect(ctx.commands.calls.slice(1).map((argv) => argv[3])).toStrictEqual([
    'repos/example/api/dispatches',
    'repos/example/web/dispatches',
  ]);

  expect(ctx.output).toStrictEqual([
    'Dispatched 3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e to example/api.\n',
    'Dispatched 3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e to example/web.\n',
  ]);
});

test('it sends to the other repos and then fails when one refuses the dispatch', async () => {
  const ctx = setupTest();

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--paginate',
      'installation/repositories',
      '--jq',
      '.repositories[] | select(.archived | not) | .full_name',
    ],
    { exitCode: 0, stdout: 'example/web\nexample/api\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/api/dispatches',
      '-f',
      'event_type=zgeoff-tools-sync',
      '-f',
      'client_payload[sha]=3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
    ],
    { exitCode: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/web/dispatches',
      '-f',
      'event_type=zgeoff-tools-sync',
      '-f',
      'client_payload[sha]=3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  const exitCode = await ctx.dispatch('3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e');

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    '::error::example/api refused the dispatch: gh: Not Found (HTTP 404)\n',
    'Dispatched 3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e to example/web.\n',
  ]);
});

test('it fails and sends nothing when it cannot list the repos of the sync App', async () => {
  const ctx = setupTest();

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--paginate',
      'installation/repositories',
      '--jq',
      '.repositories[] | select(.archived | not) | .full_name',
    ],
    { exitCode: 1, stdout: '', stderr: 'gh: Bad credentials (HTTP 401)\n' },
  );

  const exitCode = await ctx.dispatch('3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e');

  expect(exitCode).toBe(1);
  expect(ctx.commands.calls).toHaveLength(1);

  expect(ctx.output).toStrictEqual([
    "::error::Cannot list the sync App's repos: gh: Bad credentials (HTTP 401)\n",
  ]);
});

test('it refuses a commit that is not a full commit ID and sends nothing', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.dispatch('main');

  expect(exitCode).toBe(1);
  expect(ctx.commands.calls).toStrictEqual([]);
  expect(ctx.output).toStrictEqual(["::error::'main' is not a full commit ID\n"]);
});
