# 0001: A grant is a user row

- Date: 2026-11-13
- Status: decided

## Decision

`@zgeoff/mcp-auth` stores each grant as one row of better-auth's `user` table. Every access token,
refresh token and session of the grant references that row with `on delete cascade`, and a revoke
deletes the row.

## Why

- better-auth runs a refresh as separate statements with no transaction: it marks the old refresh
  token used, then inserts the new tokens. A revoke that commits between those statements must still
  end the grant.
- A test against the real token endpoint, with the revoke on a second SQLite connection at each
  point of the refresh, showed that a delete of the grant's token rows leaves the new tokens alive.
  A delete of the grant's `user` row left no token alive in any order, because the foreign key
  refuses the inserts that come after it.
- One delete ends every token and session of the grant, so revoke has one code path.

## Rejected alternatives

| Option                                                                            | Why not                                                                                                               |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| delete the token rows of the grant by `authorizationCodeId`                       | the test showed the new tokens of a refresh in flight survive the delete                                              |
| a revoked-grant table, with insert triggers that refuse tokens of a revoked grant | it closes the race too, but needs a table and two triggers per app, and a second code path for every way a grant ends |
| one owner `user` row shared by every grant                                        | a delete of that row ends every grant at once                                                                         |

## Consequences

- Each app runs a migration that gives each existing grant its own `user` row.
- The core refuses to open a database whose foreign keys are off, or whose token and session tables
  lack the cascading key.
- better-auth needs a unique email on each `user` row, so each grant row carries a placeholder
  email.
