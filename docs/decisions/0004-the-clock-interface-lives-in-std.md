# 0004: The clock interface lives in std

- Date: 2026-11-21
- Status: decided

## Decision

`@zgeoff/std` exports one `Clock` interface and a `systemClock` that implements it:

- `now()` returns epoch milliseconds;
- `schedule(fire, delayMs)` calls `fire` after `delayMs`, and returns a function that cancels that
  call;
- `sleep(delayMs, signal?)` resolves after `delayMs`, or as soon as `signal` aborts, and never
  rejects.

Production code in every zgeoff repo takes its clock as a `Clock`, or a `Pick` of one. The one fake
clock is `createFakeClock`, exported by the subpath `@zgeoff/testing/clock`.

## Why

- Production code can't import a test package such as `@zgeoff/testing`. A fake clock that every
  repo shares needs an interface in a package that production code already imports.
- `@zgeoff/std` has no dependencies, and every zgeoff repo installs it.
- The repos had four clock interfaces, with different method names, argument orders and abort
  behaviours. One interface lets one fake serve them all.
- A caller aborts the signal it passes to `sleep` on purpose, so the abort is no error. A `sleep`
  that resolves on abort lets the caller check `signal.aborted` and return, with nothing to catch.

## Rejected alternatives

| Option                                     | Why not                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| a fake that fits each repo's own interface | the fake carries every method name, and both a `sleep` that resolves and one that rejects on abort |
| the interface in `@zgeoff/testing`         | production code would import a test package                                                        |
| a `sleep` that rejects on abort            | every caller wraps its `sleep` in a `try`, for an abort it made itself                             |

## Consequences

- `@zgeoff/std` never depends on `@zgeoff/testing` in any dependency field. `@zgeoff/testing`
  depends on `@zgeoff/std` for `Clock`, so a dependency back would make a cycle. The tools repo's
  `check:release-workflow` fails on a cycle, because a cycle stops release-please.
- A caller of `sleep` checks `signal.aborted` after it, and catches no abort error.
