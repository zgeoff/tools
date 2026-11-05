import { expect, test } from 'bun:test';
import { toBenchName } from './to-bench-name.ts';

test.each([
  ['packages/kettle/bench/boil.bench.ts', 'boil'],
  ['bench/pour-one-cup.bench.ts', 'pour-one-cup'],
])('it names %s %s', (file, expected) => {
  expect(toBenchName(file)).toBe(expected);
});
