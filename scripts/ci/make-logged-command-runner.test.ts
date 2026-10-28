import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildStubOutputSink } from '../../test-utils/build-stub-output-sink.ts';
import { makeLoggedCommandRunner } from './make-logged-command-runner.ts';
import type { CommandResult } from './run-command.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-make-logged-command-runner-'));

  const stopping = new AbortController();

  const commands: Promise<CommandResult>[] = [];

  // Stops every command the test started and waits for each to exit, and only then removes the
  // folder the commands run in.
  onTestFinished(async () => {
    stopping.abort();

    await Promise.allSettled(commands);

    await rm(directory, { recursive: true, force: true });
  });

  const stdout = buildStubOutputSink();
  const stderr = buildStubOutputSink();
  const runLoggedCommand = makeLoggedCommandRunner({ stdout, stderr });

  const startCommand = (argv: readonly string[]) => {
    const running = runLoggedCommand(argv, {
      cwd: directory,
      env: { PATH: process.env['PATH'] },
      signal: stopping.signal,
    });

    commands.push(running);

    return running;
  };

  return { directory, stdout, stderr, runLoggedCommand, startCommand };
}

test('it copies the output while the command still runs', async () => {
  const ctx = await setupTest();

  const release = join(ctx.directory, 'release');

  // The command prints a line, then waits until the test creates the release file.
  const running = ctx.startCommand([
    'sh',
    '-c',
    'echo boiling; until [ -e "$1" ]; do sleep 0.01; done; echo boiled',
    'sh',
    release,
  ]);

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
  const result = await ctx.startCommand(['sh', '-c', 'echo boiled; echo steam >&2; exit 3']);

  expect(result.exitCode).toBe(3);
  expect(result.stdout).toBe('boiled\n');
  expect(result.stderr).toBe('steam\n');
  expect(ctx.stdout.readText()).toBe('boiled\n');
  expect(ctx.stderr.readText()).toBe('steam\n');
});

test('it stops the command when its signal aborts, and returns the exit code of the stop', async () => {
  const ctx = await setupTest();

  const stopping = new AbortController();

  const running = ctx.runLoggedCommand(['sh', '-c', 'echo boiling; exec sleep 30'], {
    cwd: ctx.directory,
    env: { PATH: process.env['PATH'] },
    signal: stopping.signal,
  });

  await ctx.stdout.firstWrite;

  stopping.abort();

  const result = await running;

  expect(result.exitCode).toBe(143);
  expect(result.stdout).toBe('boiling\n');
});
