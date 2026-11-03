import { expect, mock, test } from 'bun:test';
import type { CommandOptions } from './run-command.ts';
import { runEval } from './run-eval.ts';
import { makeRecordingStub } from './test-utils/make-recording-stub.ts';

function setupTest(files?: readonly string[], exitCodes: readonly number[] = []) {
  const evalFiles = [
    'evals/taste/run-taste-eval.ts',
    'packages/kettle/evals/steam/run-steam-eval.ts',
  ];

  const signal = new AbortController().signal;

  const codes = [...exitCodes];

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(codes.shift() ?? 0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return {
    runCommand,
    output,
    run: { repoRoot: '/repo', environment: {}, signal, runID: '1' },
    deps: { output, runCommand, readTrackedFiles: () => Promise.resolve(files ?? evalFiles) },
  };
}

test('it runs each evaluation with bun from the repo root, one after another', async () => {
  const ctx = setupTest();

  const exitCode = await runEval([], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);

  expect(ctx.runCommand.mock.calls.map((call) => call[0])).toStrictEqual([
    ['bun', 'evals/taste/run-taste-eval.ts'],
    ['bun', 'packages/kettle/evals/steam/run-steam-eval.ts'],
  ]);

  expect(ctx.runCommand.mock.calls[0]?.[1].cwd).toBe('/repo');
});

test('it runs the rest and exits 1 when one evaluation fails', async () => {
  const ctx = setupTest(undefined, [3, 0]);

  const exitCode = await runEval([], ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
  expect(ctx.runCommand).toHaveBeenCalledTimes(2);
});

test('it runs only the evaluation that the name picks', async () => {
  const ctx = setupTest();

  await runEval(['steam'], ctx.run, ctx.deps);

  expect(ctx.runCommand.mock.calls.map((call) => call[0])).toStrictEqual([
    ['bun', 'packages/kettle/evals/steam/run-steam-eval.ts'],
  ]);
});

test('it exits 1 and names the evaluations when the name matches none', async () => {
  const ctx = setupTest();

  const exitCode = await runEval(['brew'], ctx.run, ctx.deps);

  expect(exitCode).toBe(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig eval: no evaluation named "brew"; the evaluations are taste, steam\n',
  );
});

test('it says so and exits 0 when the repo has no evaluation', async () => {
  const ctx = setupTest([]);

  const exitCode = await runEval([], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the repo has no evaluations\n');
});

test('it exits 2 for more than one name', async () => {
  const ctx = setupTest();

  const exitCode = await runEval(['taste', 'steam'], ctx.run, ctx.deps);

  expect(exitCode).toBe(2);
});
