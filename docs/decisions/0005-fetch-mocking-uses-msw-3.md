# 0005: Fetch mocking uses msw 3

- Date: 2026-11-21
- Status: decided

## Decision

Tests in every zgeoff repo mock `fetch` through `@zgeoff/testing/fetch`, the test package's msw
subpath. It builds one msw network per test process with msw 3's `defineNetwork` and the
`FetchInterceptor` from `@mswjs/interceptors/fetch/web`. No repo calls msw 2's `setupServer`.

## Why

- msw 3 is the major version that most of the repos run, so one major version and one setup serve
  every repo.
- Under Bun 1.4.3, msw 3 with the `fetch/web` interceptor answers a request that a handler matches,
  and makes the `fetch` promise reject for a request that none matches.
- One setup means one place for the two fixes that every repo needs under Bun: sending a request
  with Bun's `unix` or `tls` option to Bun's own `fetch`, and failing the test on an unmatched
  request that the code under test caught.

## Rejected alternatives

| Option                                      | Why not                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| msw 2.15 `setupServer`                      | it works under Bun 1.4.3, but most repos run msw 3, so they would move back a major version |
| the `@mswjs/interceptors/fetch` interceptor | under Bun 1.4.3 it answers no request, and lets an unmatched request reach the network      |
| support msw 2 and msw 3 in one subpath      | two setups to test, and the peer dependency range would span a major version                |

## Consequences

- A request made with Bun's `unix` or `tls` option goes to Bun's own `fetch` and reaches the real
  server, because msw drops both options. A test that mocks such a request starts a stub server.
