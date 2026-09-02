import { matcherHint, printExpected, printReceived, printWithType } from 'jest-matcher-utils';
import type { JestExtendedMatcher, MatcherContext } from './types.ts';

// The exact util functions jest-extended matchers destructure off `this.utils`.
const jestMatcherUtils = { matcherHint, printExpected, printReceived, printWithType };

// jest-extended matchers destructure `this.utils`, and Bun's native utils are
// brand-checked: called unbound they throw "Expected this to be instanceof
// ExpectMatcherUtils", so a failing assertion would crash instead of printing
export function withJestContext(matcher: JestExtendedMatcher): JestExtendedMatcher {
  return function jestContextAdapter(
    this: Readonly<MatcherContext>,
    ...args: Readonly<Parameters<JestExtendedMatcher>>
  ) {
    const context = new Proxy(this, {
      get(target: Readonly<MatcherContext>, prop): unknown {
        if (prop === 'utils') {
          return jestMatcherUtils;
        }

        const value: unknown = Reflect.get(target, prop);

        if (typeof value === 'function') {
          return value.bind(target);
        }

        return value;
      },
    });

    return matcher.call(context, ...args);
  };
}
