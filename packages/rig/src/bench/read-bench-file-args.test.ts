import { expect, test } from 'bun:test';
import { readBenchFileArgs } from './read-bench-file-args.ts';

test('it reads the bench file and the report path', () => {
  expect(
    readBenchFileArgs(['/kettle/bench/boil.bench.ts', '--report', '/kettle/head.jsonl']),
  ).resolves.toStrictEqual({
    kind: 'parsed',
    file: '/kettle/bench/boil.bench.ts',
    reportPath: '/kettle/head.jsonl',
  });
});

test.each([
  ['no report', ['/kettle/bench/boil.bench.ts'], "Optional argument '--report' is required"],
  [
    'a report with no path',
    ['/kettle/bench/boil.bench.ts', '--report'],
    "Optional argument '--report' requires a value",
  ],
  [
    'an unknown option',
    ['/kettle/bench/boil.bench.ts', '--report', '/kettle/head.jsonl', '--cup'],
    'Unknown option: --cup',
  ],
])('it refuses %s', (_title, args, reason) => {
  expect(readBenchFileArgs(args)).resolves.toStrictEqual({ kind: 'refused', reason });
});
