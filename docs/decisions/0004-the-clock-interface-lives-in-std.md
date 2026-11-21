# 0004: The clock interface lives in std

- Date: 2026-11-21
- Status: decided

## Decision

`@zgeoff/std` exports one `Clock` interface, with `now()`, `schedule(fire, delayMs)` and
`sleep(delayMs, signal?)`, and a `systemClock` that implements it. An aborted `sleep` resolves.
Production code in every zgeoff repo takes its clock as a `Clock`, or a `Pick` of one, and
`@zgeoff/testing/clock` holds the one fake.

## Why

- Production code can't import a test package, so a fake that the kit shares needs an interface that
  production code can import.
- `std` has no dependencies, and every repo already installs it.
- The repos had four clock shapes, and impz alone had two `StartTimer` types with their arguments in
  opposite orders.
- A `sleep` that resolves on abort lets a caller check `signal.aborted` and return, with no error to
  catch for a cancel the caller asked for.

## Rejected alternatives

| Option                                       | Why not                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| a fake that fits each repo's own clock shape | keeps four shapes, and the fake carries every method name and both abort behaviours |
| the interface in `@zgeoff/testing`           | production code would import a test package                                         |
| a `sleep` that rejects on abort              | every caller wraps a cancel it asked for in a `try`                                 |

## Consequences

- `std` never depends on `@zgeoff/testing`, because `testing` depends on `std` and tools fails on a
  dependency cycle.
- Each repo moves its clock to `Clock`, and stu's callers of `sleep` check the signal in place of
  catching.
