# 0005: Fetch mocking uses msw 3

- Date: 2026-11-21
- Status: decided

## Decision

Tests in every zgeoff repo mock `fetch` through `@zgeoff/testing/fetch`, a subpath of the testing
package `@zgeoff/testing`. It sets up one msw network per test process: msw 3's `defineNetwork`,
which patches `fetch` and answers requests from handlers, with the `FetchInterceptor` from
`@mswjs/interceptors/fetch/web`. No repo calls msw 2's `setupServer`.

## Why

- When this was decided, about half the zgeoff repos ran msw 3, and the other half and the tools
  repo ran msw 2.15. msw 3 is msw's current major version, so moving every repo onto it at once
  leaves one setup to keep, and no later move off msw 2.
- Under Bun 1.4.3, the interceptor choice decides whether mocking works at all. With the `fetch/web`
  interceptor, msw 3 answers a request that a handler matches, and the `fetch` call rejects for a
  request that no handler matches. The `@mswjs/interceptors/fetch` interceptor does neither: it
  answers no request, and lets an unmatched request reach the real network.
- One setup keeps in one place the fixes that every repo needs under Bun. msw drops Bun's `unix` and
  `tls` fetch options from a request it passes through to a real server, so the kit sends each
  `unix` call and each call to a loopback host straight to Bun's own `fetch`. Code under test can
  catch a rejected `fetch`, so the kit fails the test on any unmatched request.

## Rejected alternatives

| Option                 | Why not                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| msw 2.15 `setupServer` | it works under Bun 1.4.3, but the repos on msw 3 would move back a major version, and all would move later |

## Consequences

- A `unix` call or a call to a loopback host skips msw and reaches the real server. To fake that
  server, the test starts one with `@zgeoff/testing/server`. Every other call goes through msw,
  `tls` option or not.
