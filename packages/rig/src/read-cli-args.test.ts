import { expect, test } from 'bun:test';
import { readCLIArgs } from './read-cli-args.ts';

test('it reads the command and the paths after it', async () => {
  const args = await readCLIArgs(['related', 'src/a.ts', 'src/b.ts']);

  expect(args).toStrictEqual({
    command: 'related',
    extraArgs: ['src/a.ts', 'src/b.ts'],
    hasIsolateOption: false,
  });
});

test('it passes on a flag after the command, which bun run hands over without its --', async () => {
  const args = await readCLIArgs(['unit', '--seed=1']);

  expect(args).toStrictEqual({ command: 'unit', extraArgs: ['--seed=1'], hasIsolateOption: false });
});

test('it passes on flags and paths after the command in their order', async () => {
  const args = await readCLIArgs(['unit', '--bail', './a.test.ts']);

  expect(args).toStrictEqual({
    command: 'unit',
    extraArgs: ['--bail', './a.test.ts'],
    hasIsolateOption: false,
  });
});

test('it drops a -- that leads the arguments after the command', async () => {
  const args = await readCLIArgs(['unit', '--', '--seed=1']);

  expect(args).toStrictEqual({ command: 'unit', extraArgs: ['--seed=1'], hasIsolateOption: false });
});

test('it drops a -- between the paths and the flags', async () => {
  const args = await readCLIArgs(['unit', './src/a.test.ts', '--', '--bail', '--timeout=9000']);

  expect(args).toStrictEqual({
    command: 'unit',
    extraArgs: ['./src/a.test.ts', '--bail', '--timeout=9000'],
    hasIsolateOption: false,
  });
});

test.each([
  ['a bare isolate', ['--isolate']],
  ['an isolate joined with =true', ['--isolate=true']],
  ['an isolate joined with =false', ['--isolate=false']],
  ['an isolate among other arguments', ['--bail', '--isolate', './src']],
])('it finds %s, and still passes the arguments on', async (_, extraArgs) => {
  const args = await readCLIArgs(['unit', ...extraArgs]);

  expect(args).toStrictEqual({ command: 'unit', extraArgs, hasIsolateOption: true });
});

test.each([
  ['the no-isolate that rig passes itself', ['--no-isolate']],
  ['an option that only starts like isolate', ['--isolated']],
  ['a path that holds the word', ['--seed=1', './src/isolate.test.ts']],
])('it finds no isolate option in %s', async (_, extraArgs) => {
  const args = await readCLIArgs(['unit', ...extraArgs]);

  expect(args).toMatchObject({ hasIsolateOption: false });
});

test('it refuses a command line with no command', async () => {
  const args = await readCLIArgs([]);

  expect(args).toBe("Positional argument 'command' is required");
});

test('it refuses a flag in the place of the command', async () => {
  const args = await readCLIArgs(['--bail']);

  expect(args).toBeString();
});
