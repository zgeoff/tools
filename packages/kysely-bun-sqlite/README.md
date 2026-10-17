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
