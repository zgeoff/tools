import { expect, test } from 'bun:test';
import { readCLIArgs } from './read-cli-args.ts';

test('it reads the command and the paths after it', async () => {
  const args = await readCLIArgs(['related', 'src/a.ts', 'src/b.ts']);

  expect(args).toStrictEqual({ command: 'related', extraArgs: ['src/a.ts', 'src/b.ts'] });
});

test('it passes on a flag after the command, which bun run hands over without its --', async () => {
  const args = await readCLIArgs(['unit', '--seed=1']);

  expect(args).toStrictEqual({ command: 'unit', extraArgs: ['--seed=1'] });
});

test('it passes on flags and paths after the command in their order', async () => {
  const args = await readCLIArgs(['unit', '--bail', './a.test.ts']);

  expect(args).toStrictEqual({ command: 'unit', extraArgs: ['--bail', './a.test.ts'] });
});

test('it drops a -- that leads the arguments after the command', async () => {
  const args = await readCLIArgs(['unit', '--', '--seed=1']);

  expect(args).toStrictEqual({ command: 'unit', extraArgs: ['--seed=1'] });
});

test('it drops a -- between the paths and the flags', async () => {
  const args = await readCLIArgs(['unit', './src/a.test.ts', '--', '--bail', '--timeout=9000']);

  expect(args).toStrictEqual({
    command: 'unit',
    extraArgs: ['./src/a.test.ts', '--bail', '--timeout=9000'],
  });
});

test('it refuses a command line with no command', async () => {
  const args = await readCLIArgs([]);

  expect(args).toBe("Positional argument 'command' is required");
});

test('it refuses a flag in the place of the command', async () => {
  const args = await readCLIArgs(['--bail']);

  expect(args).toBeString();
});
