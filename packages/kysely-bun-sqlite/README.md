# @zgeoff/kysely-bun-sqlite

A Kysely driver and dialect over one `bun:sqlite` database handle. Kysely ships no `bun:sqlite`
dialect, so a repo that pairs the two builds its dialect from this package.

## Install

```sh
bun add @zgeoff/kysely-bun-sqlite kysely
```

Kysely is a peer dependency, so the repo picks its own Kysely version within the peer range.

## Usage

The repo opens the handle and sets its pragmas, then passes the handle to `buildSQLiteDialect`.

```ts
import { Database } from 'bun:sqlite';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';

interface LibrarySchema {
  books: { title: string };
}

const sqlite = new Database('library.db', { create: true });

sqlite.run('CREATE TABLE IF NOT EXISTS books (title TEXT NOT NULL)');

const db = new Kysely<LibrarySchema>({ dialect: buildSQLiteDialect(sqlite) });

const titles = await db.selectFrom('books').select('title').execute();

await db.destroy();
sqlite.close();
```

The opener owns the handle. `db.destroy()` waits for the caller that holds the connection and leaves
the handle open, so the opener closes the handle after `db.destroy()` resolves.

The driver refuses a streaming query, so `stream()` on a Kysely query throws.

## Parameters

bun:sqlite binds a parameter it does not support, such as a `Date`, a plain object or `undefined`,
as `NULL` without an error. The driver checks each parameter with `isSQLQueryBinding` before it
binds, and when one fails it throws a `TypeError` whose message holds the parameter's type. Convert
such a value first, such as a `Date` to its ISO string.

`isSQLQueryBinding` is exported for a driver of its own that binds Kysely's parameters to
bun:sqlite. It accepts a string, a number, a bigint, a boolean, `null`, or a typed array.
