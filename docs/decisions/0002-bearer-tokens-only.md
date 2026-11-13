# 0002: Bearer tokens only

- Date: 2026-11-13
- Status: decided

## Decision

`@zgeoff/mcp-auth` issues bearer tokens only. Its token route drops a `DPoP` header before
better-auth reads the request, its metadata documents list no DPoP fields, and `verify` refuses any
token with a `cnf` claim.

## Why

- No route of the core checks a DPoP proof. A DPoP-bound token that `verify` accepted without its
  proof would work for a thief, like a bearer token, while the client believed it was bound.
- [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449) lets a server that does not support DPoP issue
  a bearer token to a client that sent a proof. A client that sends DPoP still connects.

## Rejected alternatives

| Option                                              | Why not                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| refuse a token request that carries a `DPoP` header | a client that always sends DPoP could never connect                                                                     |
| check DPoP proofs on `/mcp`                         | every route and every app would need the proof check, and the hosted MCP clients the apps serve work with bearer tokens |

## Consequences

- A stolen access token works until it expires, after 15 minutes, or until its grant is revoked.
