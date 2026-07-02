import { expect } from 'bun:test';
import type { CustomMatcher } from 'bun:test';
import matchers from 'jest-extended';
import { matcherHint, printExpected, printReceived, printWithType } from 'jest-matcher-utils';

// Every jest-extended matcher except `pass`/`fail` (unimplemented upstream). Bun
// implements many of these natively with slightly different signatures, so the
// augmentation below excludes whatever the builtin interfaces already declare —
// keys are listed here explicitly because CustomMatchers carries a string index
// signature that makes `keyof` useless.
type JestExtendedMatcherName =
  | 'toBeAfter'
  | 'toBeAfterOrEqualTo'
  | 'toBeArray'
  | 'toBeArrayOfSize'
  | 'toBeBefore'
  | 'toBeBeforeOrEqualTo'
  | 'toBeBetween'
  | 'toBeBigInt'
  | 'toBeBoolean'
  | 'toBeDate'
  | 'toBeDateString'
  | 'toBeEmpty'
  | 'toBeEmptyObject'
  | 'toBeEven'
  | 'toBeExtensible'
  | 'toBeFalse'
  | 'toBeFinite'
  | 'toBeFrozen'
  | 'toBeFunction'
  | 'toBeHexadecimal'
  | 'toBeInRange'
  | 'toBeInteger'
  | 'toBeNaN'
  | 'toBeNegative'
  | 'toBeNil'
  | 'toBeNumber'
  | 'toBeObject'
  | 'toBeOdd'
  | 'toBeOneOf'
  | 'toBePositive'
  | 'toBeSealed'
  | 'toBeString'
  | 'toBeSymbol'
  | 'toBeTrue'
  | 'toBeValidDate'
  | 'toBeWithin'
  | 'toChange'
  | 'toChangeBy'
  | 'toChangeTo'
  | 'toContainAllEntries'
  | 'toContainAllKeys'
  | 'toContainAllValues'
  | 'toContainAnyEntries'
  | 'toContainAnyKeys'
  | 'toContainAnyValues'
  | 'toContainEntries'
  | 'toContainEntry'
  | 'toContainKey'
  | 'toContainKeys'
  | 'toContainValue'
  | 'toContainValues'
  | 'toEndWith'
  | 'toEqualCaseInsensitive'
  | 'toEqualIgnoringWhitespace'
  | 'toHaveBeenCalledAfter'
  | 'toHaveBeenCalledBefore'
  | 'toHaveBeenCalledExactlyOnceWith'
  | 'toHaveBeenCalledOnce'
  | 'toInclude'
  | 'toIncludeAllMembers'
  | 'toIncludeAllPartialMembers'
  | 'toIncludeAnyMembers'
  | 'toIncludeMultiple'
  | 'toIncludeRepeated'
  | 'toIncludeSameMembers'
  | 'toIncludeSamePartialMembers'
  | 'toPartiallyContain'
  | 'toReject'
  | 'toResolve'
  | 'toSatisfy'
  | 'toSatisfyAll'
  | 'toSatisfyAny'
  | 'toStartWith'
  | 'toThrowWithMessage';

declare module 'bun:test' {
  interface Matchers<T>
    extends
      Pick<
        CustomMatchers<void>,
        Exclude<JestExtendedMatcherName, keyof MatchersBuiltin | 'toResolve' | 'toReject'>
      >,
      // the two async matchers return a promise the caller must await
      Pick<CustomMatchers<Promise<void>>, 'toResolve' | 'toReject'> {}
  // `never` (not `any`) so asymmetric matchers fit any value position in
  // toEqual/toMatchObject without tripping typescript/no-unsafe-assignment
  // oxlint-disable-next-line typescript/no-empty-interface -- module augmentation, emptiness is the point
  interface AsymmetricMatchers extends Pick<
    CustomMatchers<never>,
    Exclude<JestExtendedMatcherName, keyof AsymmetricMatchersBuiltin>
  > {}
}

type JestExtendedMatcher = CustomMatcher<unknown, unknown[]>;
// bun:test declares MatcherContext without exporting it; recover it from the
// `this` parameter of the exported CustomMatcher type.
type MatcherContext = ThisParameterType<JestExtendedMatcher>;

// The exact util functions jest-extended matchers destructure off `this.utils`.
const jestMatcherUtils = { matcherHint, printExpected, printReceived, printWithType };

// jest-extended matchers destructure `this.utils` (e.g. `const { printReceived } =
// this.utils`) and expect jest's util signatures. Bun's native utils are brand-checked
// — calling them unbound throws "Expected this to be instanceof ExpectMatcherUtils"
// — so every failing assertion would crash instead of printing its message. Hand
// each matcher a context whose `utils` come from the real jest-matcher-utils package
// and whose remaining methods (`equals`, …) stay bound to the native context.
function withJestContext(matcher: JestExtendedMatcher): JestExtendedMatcher {
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
