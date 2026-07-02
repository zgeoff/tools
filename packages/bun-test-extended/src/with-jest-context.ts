import { matcherHint, printExpected, printReceived, printWithType } from 'jest-matcher-utils';
import type { JestExtendedMatcher, MatcherContext } from './types.ts';

// The exact util functions jest-extended matchers destructure off `this.utils`.
const jestMatcherUtils = { matcherHint, printExpected, printReceived, printWithType };

// jest-extended matchers destructure `this.utils` (e.g. `const { printReceived } =
// this.utils`) and expect jest's util signatures. Bun's native utils are brand-checked
// — calling them unbound throws "Expected this to be instanceof ExpectMatcherUtils"
// — so every failing assertion would crash instead of printing its message. Hand
// each matcher a context whose `utils` come from the real jest-matcher-utils package
// and whose remaining methods (`equals`, …) stay bound to the native context.
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
