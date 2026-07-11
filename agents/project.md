## Type checking

Type errors are checked by two engines on purpose: `lint:type-aware` includes tsgolint's
experimental `--type-check` (fast, run it locally), while `typecheck` runs real `tsc` per package
(ground truth). CI runs both until tsgolint earns trust; if they ever disagree, believe `tsc`.

## Workspace dependencies

- Shared versions live in the root catalog; workspace packages reference them via `catalog:`.

## Testing

- Never use `describe` — write flat `test(…)` blocks with behavioural titles that start with "it"
  (`test('it pads before a return statement', …)`).
- Test files are co-located with the module they test (`parse-source.ts` beside
  `parse-source.test.ts`) — no `test/`, `tests/` or `__tests__` directories. Declaration emit
  excludes `*.test.ts`, so they never ship.
- Run `bun test` from the repo root: the jest-extended preload lives in the root `bunfig.toml`, so
  package-cwd runs are missing the extra matchers.
- Tests declare their own data inline — no fixtures shared between tests, even if that means
  duplication.
- Tests are mock-free: pure modules assert on return values, file-touching ones use `mkdtemp` trees,
  and CLI behaviour is asserted end-to-end by spawning the real binary. If a module is hard to test
  without mocking, move its I/O to the caller.
- Reach for jest-extended matchers instead of hand-rolling assertions. Frequently useful:
  - arrays
    - `toIncludeAllMembers`
    - `toIncludeSameMembers`
    - `toPartiallyContain`
    - `toIncludeAllPartialMembers`
    - `toSatisfyAll`
  - objects
    - `toContainEntry`
    - `toContainEntries`
    - `toContainAllKeys`
    - `toBeFrozen`
  - strings
    - `toStartWith`
    - `toEndWith`
    - `toInclude`
    - `toEqualCaseInsensitive`
    - `toEqualIgnoringWhitespace`
  - values
    - `toBeNil`
    - `toBeOneOf`
    - `toSatisfy`
    - `toBeWithin`
    - `toBeEmpty`
  - dates
    - `toBeAfter`
    - `toBeBefore`
    - `toBeBetween`
    - `toBeValidDate`
  - mocks
    - `toHaveBeenCalledOnce`
    - `toHaveBeenCalledExactlyOnceWith`
    - `toHaveBeenCalledBefore`
    - `toHaveBeenCalledAfter`
  - errors/async
    - `toThrowWithMessage`
    - `toResolve` (returns a promise — always `await`)
    - `toReject` (returns a promise — always `await`)
- Matchers also work asymmetrically inside `toEqual`/`toMatchObject`
  (`status: expect.toBeOneOf([…])`).
- Known gaps: `expect.pass`/`expect.fail` are unimplemented upstream and excluded from our types.
  It's `toEqualCaseInsensitive` — not `…Insensitively` as some docs claim; unknown matcher names
  fail typecheck here (upstream's own types are looser and would let typos through).
