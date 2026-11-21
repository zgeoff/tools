# 0004: The clock interface lives in std

- Date: 2026-11-21
- Status: decided

## Decision

`@zgeoff/std` exports one `Clock` interface and a `systemClock` that implements it:

- `now()` returns epoch milliseconds;
- `schedule(fire, delayMs)` returns a function that cancels the call;
- `sleep(delayMs, signal?)` resolves after the delay, or at once when the signal aborts, and never
  rejects.

Production code in every zgeoff repo takes its clock as a `Clock`, or a `Pick` of one. The one fake
clock lives in the test package, `@zgeoff/testing`, under `./clock`.

## Why

- Production code can't import a test package. A fake clock that every repo shares needs an
  interface in a package that production code already imports.
- `@zgeoff/std` has no dependencies, and every zgeoff repo installs it.
- The repos had four clock interfaces, with different method names, argument orders and abort
  behaviours. One interface lets one fake serve them all.
- A cancel is something the caller asked for. A `sleep` that resolves on abort lets the caller check
  `signal.aborted` and return, with no error to catch.

## Rejected alternatives

| Option                                     | Why not                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| a fake that fits each repo's own interface | the fake carries every method name, and both a `sleep` that resolves and one that rejects on abort |
| the interface in `@zgeoff/testing`         | production code would import a test package                                                        |
| a `sleep` that rejects on abort            | every caller wraps a cancel it asked for in a `try`                                                |

## Consequences

- `@zgeoff/std` never depends on `@zgeoff/testing` in any dependency field. `@zgeoff/testing`
  depends on `@zgeoff/std`, and the tools repo's `check:release-workflow` fails on a dependency
  cycle, which would stop release-please.
- A caller of `sleep` checks `signal.aborted` after it, and catches no abort error.
