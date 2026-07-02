import './augment-bun-test.ts';
import { expect } from 'bun:test';
import matchers from 'jest-extended';
import type { JestExtendedMatcher } from './types.ts';
import { withJestContext } from './with-jest-context.ts';

const matcherEntries: readonly [string, JestExtendedMatcher][] = Object.entries(matchers);

expect.extend(
  Object.fromEntries(
    matcherEntries.map(
      ([name, matcher]: readonly [string, JestExtendedMatcher]): [string, JestExtendedMatcher] => [
        name,
        withJestContext(matcher),
      ],
    ),
  ),
);
