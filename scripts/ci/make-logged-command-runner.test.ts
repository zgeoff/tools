import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildStubOutputSink } from '../../test-utils/build-stub-output-sink.ts';
import { makeLoggedCommandRunner } from './make-logged-command-runner.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-make-logged-command-runner-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const stdout = buildStubOutputSink();
  const stderr = buildStubOutputSink();
  const runLoggedCommand = makeLoggedCommandRunner({ stdout, stderr });

  return { directory, stdout, stderr, runLoggedCommand };
}

test('it copies the output while the command still runs', async () => {
  const ctx = await setupTest();

  const release = join(ctx.directory, 'release');

  // The command prints a line, then waits until the test creates the release file. It also stops
  // once the test folder is gone, so the folder's onTestFinished cleanup ends a test that fails first.
  const running = ctx.runLoggedCommand(
    [
      'sh',
      '-c',
      'echo boiling; until [ -e "$1" ] || [ ! -d "$2" ]; do sleep 0.01; done; echo boiled',
      'sh',
      release,
      ctx.directory,
    ],
    { cwd: ctx.directory, env: { PATH: process.env['PATH'] } },
  );

  await ctx.stdout.firstWrite;

  const before = ctx.stdout.readText();

  await writeFile(release, '');

  const result = await running;

  expect(before).toBe('boiling\n');
  expect(result.stdout).toBe('boiling\nboiled\n');
  expect(ctx.stdout.readText()).toBe('boiling\nboiled\n');
});

test('it copies stdout and stderr to their own sinks and returns them captured, with the exit code', async () => {
  const ctx = await setupTest();

  const result = await ctx.runLoggedCommand(['sh', '-c', 'echo boiled; echo steam >&2; exit 3'], {
    cwd: ctx.directory,
    env: { PATH: process.env['PATH'] },
  });

  expect(result.exitCode).toBe(3);
  expect(result.stdout).toBe('boiled\n');
  expect(result.stderr).toBe('steam\n');
  expect(ctx.stdout.readText()).toBe('boiled\n');
  expect(ctx.stderr.readText()).toBe('steam\n');
});
