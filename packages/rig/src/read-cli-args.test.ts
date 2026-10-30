import { expect, test } from 'bun:test';
import { readCLIArgs } from './read-cli-args.ts';

test('it reads the command and the paths after it', async () => {
  const args = await readCLIArgs(['related', 'src/a.ts', 'src/b.ts']);

  expect(args).toStrictEqual({ command: 'related', extraArgs: ['src/a.ts', 'src/b.ts'] });
});

test('it passes the arguments after -- on, flags included', async () => {
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

test('it refuses a flag it does not declare', async () => {
  const args = await readCLIArgs(['unit', '--bail']);

  expect(args).toBeString();
});
