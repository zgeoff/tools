import { expect, test } from 'bun:test';
import { parseCLIArgs } from './parse-cli-args.ts';

test('it reads no arguments as a run over every tracked file', async () => {
  const result = await parseCLIArgs([]);

  expect(result).toStrictEqual({ help: false, files: [] });
});

test('it reads each argument as a file', async () => {
  const result = await parseCLIArgs(['scripts/a.sh', 'b.sh']);

  expect(result).toStrictEqual({
    help: false,
    files: ['scripts/a.sh', 'b.sh'],
  });
});

test('it reads a file after -- even when it starts with a dash', async () => {
  const result = await parseCLIArgs(['--', '-a.sh']);

  expect(result).toStrictEqual({ help: false, files: ['-a.sh'] });
});

test.each([['--help'], ['-h']])('it reads %s alone as a request for help', async (flag) => {
  const result = await parseCLIArgs([flag]);

  expect(result).toStrictEqual({ help: true, files: [] });
});

test('it refuses --help with files', async () => {
  const result = await parseCLIArgs(['--help', 'bad.sh']);

  expect(result).toBe('--help takes no files');
});

test('it refuses an unknown option', async () => {
  const result = await parseCLIArgs(['--fix']);

  expect(result).toBeString();
});
