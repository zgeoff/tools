import { expect, test } from 'bun:test';
import { resolveCLIArgs } from './resolve-cli-args.ts';

test('it collects positionals as inputs and defaults every flag', async () => {
  const args = await resolveCLIArgs(['src/a.ts', 'src/b.tsx']);

  expect(args).toStrictEqual({
    mode: 'write',
    quiet: false,
    bench: false,
    help: false,
    version: false,
    ignore: [],
    inputs: ['src/a.ts', 'src/b.tsx'],
  });
});

test('it picks check mode for --check', async () => {
  const args = await resolveCLIArgs(['--check', 'a.ts']);

  expect(args).toContainEntry(['mode', 'check']);
});

test('it picks dry mode for --dry', async () => {
  const args = await resolveCLIArgs(['--dry', 'a.ts']);

  expect(args).toContainEntry(['mode', 'dry']);
});

test('it lets --check win when both --check and --dry are passed', async () => {
  const args = await resolveCLIArgs(['--dry', '--check', 'a.ts']);

  expect(args).toContainEntry(['mode', 'check']);
});

test('it parses the boolean flags', async () => {
  const args = await resolveCLIArgs(['--quiet', '--bench', '--help', '--version', 'a.ts']);

  expect(args).toStrictEqual({
    mode: 'write',
    quiet: true,
    bench: true,
    help: true,
    version: true,
    ignore: [],
    inputs: ['a.ts'],
  });
});

test('it returns an error message for an unknown flag', async () => {
  const args = await resolveCLIArgs(['--chekc', 'a.ts']);

  expect(args).toBe('Unknown option: --chekc');
});

test('it returns an error message for --ignore without a value', async () => {
  const args = await resolveCLIArgs(['a.ts', '--ignore']);

  expect(args).toInclude("'--ignore' requires a value");
});

test('it collects repeated --ignore patterns in either form', async () => {
  const args = await resolveCLIArgs(['--ignore', 'dist/**', '--ignore=**/*.gen.ts', 'a.ts']);

  expect(args).toMatchObject({ ignore: ['dist/**', '**/*.gen.ts'], inputs: ['a.ts'] });
});

test('it keeps an input after -- that starts with a dash', async () => {
  const args = await resolveCLIArgs(['--check', '--', '-odd.ts']);

  expect(args).toMatchObject({ mode: 'check', inputs: ['-odd.ts'] });
});
