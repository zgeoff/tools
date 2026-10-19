import { expect, test } from 'bun:test';
import { resolveCLIArgs } from './resolve-cli-args.ts';

test('it reads no arguments as a run over every tracked file', async () => {
  const result = await resolveCLIArgs([]);

  expect(result).toStrictEqual({ help: false, files: [] });
});

test('it reads each argument as a file', async () => {
  const result = await resolveCLIArgs(['scripts/a.sh', 'b.sh']);

  expect(result).toStrictEqual({
    help: false,
    files: ['scripts/a.sh', 'b.sh'],
  });
});

test('it reads a file after -- even when it starts with a dash', async () => {
  const result = await resolveCLIArgs(['--', '-a.sh']);

  expect(result).toStrictEqual({ help: false, files: ['-a.sh'] });
});

test.each([['--help'], ['-h']])('it reads %s alone as a request for help', async (flag) => {
  const result = await resolveCLIArgs([flag]);

  expect(result).toStrictEqual({ help: true, files: [] });
});

test('it refuses --help with files', async () => {
  const result = await resolveCLIArgs(['--help', 'bad.sh']);

  expect(result).toBe('--help takes no files');
});

test('it refuses an unknown option', async () => {
  const result = await resolveCLIArgs(['--fix']);

  expect(result).toBeString();
});
