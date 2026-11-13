# @zgeoff/mcp-auth

An OAuth server that lets a hosted MCP client, such as a Claude.ai connector, reach an app's `/mcp`
route. It is built on better-auth and `bun:sqlite`, and holds the OAuth routes and pages, passkey
login for the owner, pre-registered clients, service tokens and grant revoke. Each app passes in its
own scopes, paths, table names and grant limits.

The package exports the core from `@zgeoff/mcp-auth`, an Elysia 2 adapter from
`@zgeoff/mcp-auth/elysia` and the test helpers from `@zgeoff/mcp-auth/testing`. The package needs
Bun.

## Install

```sh
bun add @zgeoff/mcp-auth kysely
```

Kysely is a peer dependency. Elysia 2 is an optional peer dependency, needed only for the adapter.

## Usage

The app opens the server once at start, on a `bun:sqlite` connection that it owns. An app whose own
Kysely runs on that connection passes the Kysely as `database` instead, so both share one driver
lock. Each route is a function from `Request` to `Response`, and `verify` turns a bearer token into
an `Access` or `null`.

```ts
import { DEFAULT_PATHS, openMCPAuth } from '@zgeoff/mcp-auth';

const auth = await openMCPAuth({
  database: sqlite,
  origin: 'https://app.example.com',
  productName: 'app',
  scopes: ['read', 'write'],
  paths: DEFAULT_PATHS,
  tables: { passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' },
  clock: { now: () => Date.now() },
  security: { record: (event) => console.log(event) },
  onGrantRevoked: (grantID) => closeStreamsOf(grantID),
});

const access = await auth.verify(bearerToken);
```

`createMCPHTTPApp` from `@zgeoff/mcp-auth/elysia` serves the routes in an Elysia app. It refuses a
wrong Host or Origin header, and checks the bearer token before it hands a request to `mcp.fetch`.

```ts
import { createMCPHTTPApp } from '@zgeoff/mcp-auth/elysia';

app.use(
  createMCPHTTPApp({
    auth,
    hosts: new Set(['app.example.com']),
    origins: new Set(['https://app.example.com']),
    readRequester,
    security: { record: (event) => console.log(event) },
    mcp: { fetch: (request, access) => mcpHandler.fetch(request, access) },
    besidePrefix: '/api',
  }),
);
```

A command that only manages clients, grants and passkeys calls `openMCPAuthAdmin`, with no origin.

## Features

- OAuth authorization code flow with PKCE for clients the owner adds by name.
- Passkey login and consent pages, with the scopes the owner ticks.
- Refresh tokens that rotate, and a grant that ends when a client replays a replaced token.
- A revoke that ends every token of a grant with one delete, even in the middle of a refresh.
- Bearer tokens only: the token route drops DPoP, and `verify` refuses a token bound to a key.
- Service tokens for clients that cannot run the browser flow.
- An Elysia adapter that checks Host, Origin and the bearer token of each MCP request.
- Test helpers: `openTestAuth`, `authorizeTestClient`, and seeds for clients and passkeys.

## Documentation

The [design](../../docs/design/mcp-auth/README.md) holds the contracts and constraints.
