import { expect, test } from 'bun:test';
import { parseCLIArgs } from '../src/cli/parse-cli-args.ts';

test('it collects positionals as inputs and defaults to write mode', () => {
  const args = parseCLIArgs(['src/a.ts', 'src/b.tsx']);

  expect(args).toMatchObject({ mode: 'write', inputs: ['src/a.ts', 'src/b.tsx'] });
});

test('it picks check mode for --check', () => {
  expect(parseCLIArgs(['--check', 'a.ts'])).toContainEntry(['mode', 'check']);
});

test('it picks dry mode for --dry', () => {
  expect(parseCLIArgs(['--dry', 'a.ts'])).toContainEntry(['mode', 'dry']);
});

test('it lets --check win when both --check and --dry are passed', () => {
  expect(parseCLIArgs(['--dry', '--check', 'a.ts'])).toContainEntry(['mode', 'check']);
});

test('it parses the boolean flags', () => {
  const args = parseCLIArgs(['--quiet', '--bench', '--help', '--version', 'a.ts']);

  expect(args).toMatchObject({ quiet: true, bench: true, help: true, version: true });
});

test('it returns an error message for an unknown flag', () => {
  const args = parseCLIArgs(['--chekc', 'a.ts']);

  expect(args).toBeString();
  expect(args).toInclude("'--chekc'");
});
