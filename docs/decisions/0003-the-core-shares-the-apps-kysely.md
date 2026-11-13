# 0003: The core shares the app's Kysely

- Date: 2026-11-14
- Status: decided

## Decision

`openMCPAuth` and `openMCPAuthAdmin` take `database` as either a `bun:sqlite` `Database` or the
app's own Kysely. An app whose Kysely runs on the connection passes that Kysely, and the core runs
every statement and transaction through it. A `Database` stays valid for an app that gives the core
a connection no other Kysely uses.

## Why

- A Kysely holds a driver lock of its own. When the app and the core each build a Kysely over one
  connection, the core's statement can run inside an app transaction that is waiting on I/O. When
  that transaction rolls back, the core's write goes with it.
- A reproducer showed both failures on impz's shape. A revoke made during an app transaction was
  undone by its rollback, so the revoked access token still passed `verify`. A refresh was undone
  the same way, so the old refresh token worked again.
- With the app's Kysely, the core's calls queue behind the app's transaction on one lock, so they
  run after it.

## Rejected alternatives

| Option                                    | Why not                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| a second connection with `busy_timeout`   | a waiting write blocks the one JS thread of the process until the timeout                        |
| move impz's auth tables to their own file | it changes impz's storage layout for a lock problem that passing the app's Kysely already solves |

## Consequences

- An app with its own Kysely passes it, and the core's startup checks run through it.
- `close` ends only a Kysely the core built, and leaves the app's Kysely running.
- An app that passes a `Database` shared with another Kysely keeps the failure above.
