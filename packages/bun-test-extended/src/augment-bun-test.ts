// side-effect import so jest-extended's ambient CustomMatchers global is in
// the program even when this file is included standalone by another package
import 'jest-extended';
import type { JestExtendedMatcherName } from './types.ts';

// only the matchers bun's builtin interfaces don't declare: bun implements
// many jest-extended matchers natively with different signatures, and
// extending over one is a TS2320
declare module 'bun:test' {
  interface Matchers<T>
    extends
      Pick<
        CustomMatchers<void>,
        Exclude<JestExtendedMatcherName, keyof MatchersBuiltin | 'toResolve' | 'toReject'>
      >,
      Pick<CustomMatchers<Promise<void>>, 'toResolve' | 'toReject'> {}

  // `never`, not `any`: an asymmetric matcher then fits any value position in
  // toEqual/toMatchObject without tripping typescript/no-unsafe-assignment.
  // bun's own core matchers return `any`, so each one is redeclared here.
  interface AsymmetricMatchers extends Pick<
    CustomMatchers<never>,
    Exclude<JestExtendedMatcherName, keyof AsymmetricMatchersBuiltin>
  > {
    any: (
      constructor: ((...args: never[]) => unknown) | (abstract new (...args: never[]) => unknown),
    ) => never;
    anything: () => never;
    arrayContaining: (array: readonly unknown[]) => never;
    objectContaining: (object: object) => never;
    stringContaining: (text: string) => never;
    stringMatching: (pattern: string | RegExp) => never;
  }
}
