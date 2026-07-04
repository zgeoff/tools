import { expect, test } from 'bun:test';
import { parseCliArgs } from '../src/cli/parse-cli-args.ts';

test('it collects positionals as inputs and defaults to write mode', () => {
  const args = parseCliArgs(['src/a.ts', 'src/b.tsx']);

  expect(args).toMatchObject({ mode: 'write', inputs: ['src/a.ts', 'src/b.tsx'] });
});

test('it picks check mode for --check', () => {
  expect(parseCliArgs(['--check', 'a.ts'])).toContainEntry(['mode', 'check']);
});

test('it picks dry mode for --dry', () => {
  expect(parseCliArgs(['--dry', 'a.ts'])).toContainEntry(['mode', 'dry']);
});

test('it lets --check win when both --check and --dry are passed', () => {
  expect(parseCliArgs(['--dry', '--check', 'a.ts'])).toContainEntry(['mode', 'check']);
});

test('it parses the boolean flags', () => {
  const args = parseCliArgs(['--quiet', '--bench', '--help', '--version', 'a.ts']);

  expect(args).toMatchObject({ quiet: true, bench: true, help: true, version: true });
});

test('it returns an error message for an unknown flag', () => {
  const args = parseCliArgs(['--chekc', 'a.ts']);

  expect(args).toBeString();
  expect(args).toInclude("'--chekc'");
});
