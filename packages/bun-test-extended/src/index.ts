import './augmentation.ts';
import { expect } from 'bun:test';
import matchers from 'jest-extended';
import { withJestContext } from './jest-context.ts';
import type { JestExtendedMatcher } from './jest-context.ts';

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
