# @zgeoff/bun-test-extended

[jest-extended](https://jest-extended.jestcommunity.dev/) matchers for `bun test`, with working
failure messages and bun-aware types.

Plain `expect.extend(matchers)` breaks on bun: jest-extended destructures `this.utils`, bun's native
utils are brand-checked, so every _failing_ assertion crashes with
`Expected this to be instanceof ExpectMatcherUtils` instead of printing a diff. This package wraps
each matcher in an adapter that supplies the real `jest-matcher-utils` and keeps `this.equals`
bound, then registers the lot.

## Usage

```toml
# bunfig.toml — registers the matchers in every test file
[test]
preload = ["@zgeoff/bun-test-extended"]
```

```jsonc
// tsconfig.json — loads the matcher types
{ "compilerOptions": { "types": ["bun", "@zgeoff/bun-test-extended"] } }
```

```ts
test('it works', () => {
  expect(['a', 'b']).toIncludeAllMembers(['b']);
  expect({ n: 4 }).toEqual({ n: expect.toBeEven() });
});
```

## Types

- Augments `bun:test` with only the matchers bun doesn't already declare — no conflicts with
  builtins, and unknown matcher names fail typecheck (upstream's own types would let typos through).
- `toResolve`/`toReject` return `Promise<void>` — un-awaited use is visible.
- Asymmetric matchers (`expect.toBeOneOf(…)` inside `toEqual`) fit any value position.
- bun's core asymmetric matchers `any`, `anything`, `arrayContaining`, `objectContaining`,
  `stringContaining` and `stringMatching` return `never` instead of bun's `any`, so
  `{ id: expect.any(String) }` passed to `toStrictEqual` trips no `no-unsafe-*` rule and needs no
  cast. A matcher typed `never` fits any value position, so the type check no longer compares its
  shape with the expected type. `expect.closeTo` and the negated `expect.not.*` matchers keep bun's
  `any`.

## Gaps

`expect.pass`/`expect.fail` are unimplemented upstream and excluded here.
