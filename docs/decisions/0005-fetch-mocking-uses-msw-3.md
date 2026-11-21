# 0005: Fetch mocking uses msw 3

- Date: 2026-11-21
- Status: decided

## Decision

`@zgeoff/testing/fetch` builds its test network with msw 3's `defineNetwork` and the
`FetchInterceptor` from `@mswjs/interceptors/fetch/web`. Every zgeoff repo mocks fetch through it,
and none uses msw 2's `setupServer`.

## Why

- Under Bun 1.4.3, msw 3 with the `fetch/web` interceptor mocks a handled request and rejects an
  unhandled one.
- Under Bun 1.4.3, the `@mswjs/interceptors/fetch` interceptor mocks nothing and lets an unhandled
  request reach the network.
- One msw line lets the kit own one setup, with the unix-socket routing and the unhandled-request
  check.

## Rejected alternatives

| Option                          | Why not                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| msw 2.15 `setupServer`          | it works under Bun 1.4.3, but five repos already run msw 3 and would move back a major version |
| support both lines in `./fetch` | two setups to test, and the kit's peer range would span a major version                        |

## Consequences

- impz, vers, nixie, llm, osrs and auto-mode move from msw 2.15 to msw 3.
- A request made with Bun's `unix` or `tls` option skips MSW, because MSW drops both options.
