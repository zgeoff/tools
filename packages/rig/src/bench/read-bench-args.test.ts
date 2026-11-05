import { expect, test } from 'bun:test';
import { readBenchArgs } from './read-bench-args.ts';
import type { BenchArgs } from './read-bench-args.ts';

test.each<readonly [string, readonly string[], BenchArgs]>([
  ['no arguments', [], { kind: 'parsed', name: null, baseRef: null }],
  ['a name', ['boil'], { kind: 'parsed', name: 'boil', baseRef: null }],
  ['a base', ['--base', 'main'], { kind: 'parsed', name: null, baseRef: 'main' }],
  ['a base and a name', ['--base=main', 'boil'], { kind: 'parsed', name: 'boil', baseRef: 'main' }],
])('it reads %s', (_title, args, expected) => {
  expect(readBenchArgs(args)).resolves.toStrictEqual(expected);
});

test.each([
  ['two names', ['boil', 'steep'], 'takes at most one benchmark name'],
  ['a base with no ref', ['boil', '--base'], '--base needs a ref'],
  ['an unknown option', ['--kettle'], 'Unknown option: --kettle'],
])('it refuses %s', (_title, args, reason) => {
  expect(readBenchArgs(args)).resolves.toStrictEqual({ kind: 'refused', reason });
});
