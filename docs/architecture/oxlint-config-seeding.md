# oxlint-config seeding rules

The `zgeoff/seed-only` and `zgeoff/test-beside-seed` rules of the `zgeoff/*` plugin in
`@zgeoff/oxlint-config` check the seeding rules of the testing skill. `zgeoff/seed-only` keeps each
database write in test code to the places the skill allows, and `zgeoff/test-beside-seed` keeps a
test beside each seed. The [test-file rules](./oxlint-config-tests.md) cover the rest of the
test-file checks.

## `zgeoff/seed-only`

A test puts stored state in place through the seeds of the module that writes it, as the testing
skill's [Seeding](https://github.com/zgeoff/skills/blob/main/skills/testing/references/seeding.md)
reference requires. The rule checks test code: each `<name>.test.ts` or `<name>.test.tsx` file, and
each file under a `test-utils` folder below the repo root. In test code it reports a database write:

- a call of a method named `insertInto`, `updateTable` or `deleteFrom`, as Kysely names them;
- an `INSERT … INTO`, a `REPLACE INTO`, an `UPDATE … SET` or a `DELETE FROM` statement, in any
  letter case, in a string or a template literal that a SQL call takes.

The rule reads SQL only where it can run, so English prose such as "the store ran no delete from the
events table" never counts. A SQL call takes the statement as one of these:

| Form                                                                                      | Example                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------- |
| the first argument of a method named `run`, `exec`, `query`, `prepare`, `raw` or `unsafe` | `db.run('…')`, `CompiledQuery.raw('…')` |
| the first argument of a call of `sql`                                                     | `sql('…')`                              |
| the template of a tag named `sql`, alone or as a member                                   | `` sql`…` ``, `` ctx.sql`…` ``          |

The rule skips the `exec` of a regular expression literal. It misses a statement held in a variable
or built by joining strings.

A write passes in these places:

- inside a top-level function whose name starts with `seed`, in a file under `test-utils`. A
  function named `seed…` inside another function never counts;
- in the owner's own tests: a test file whose folder holds a module, other than a test, a
  declaration file or a `seed-<name>` file, that writes the same table. The rule compares table
  names without the schema, an alias, quotes or letter case;
- in a migration test: a test file whose path below the repo root holds `migrate`, `migration` or
  `migrations` as a whole word between `/`, `-`, `_` or `.`, such as `run-migrations.test.ts`;
- in a seed's own test: a `seed-<name>.test.ts` file under `test-utils`;
- to a table the same file creates, anywhere in the file, with a `CREATE TABLE` statement in a SQL
  call or with a Kysely `createTable` call.

The last place covers the testing skill's "a test of code whose product is SQL or storage, such as a
database dialect". Such a test makes the tables it needs to drive the code, as a test of a database
opener, a transaction helper, a query-plan reader, a backup or a raw file reader does. The rule
passes a write to a table the file creates even when a module writes a table of that name, because a
reader of another build's file makes tables with the real names. The rule reads `CREATE TABLE`,
`CREATE TEMP TABLE`, `CREATE TEMPORARY TABLE` and `CREATE VIRTUAL TABLE`, each with or without
`IF NOT EXISTS`, and a `createTable` call whose first argument is a string literal.

A test of storage code whose table the file does not create, such as one that opens a database file
kept in the repo, takes a file-level disable comment with the case as its reason:

```ts
// oxlint-disable zgeoff/seed-only -- tests the file reader, whose product is storage
```

The rule finds a table's owner by the table's name, so outside a seed it reports a table name that
is not a string literal, such as a variable or an interpolation in the statement. The rule reads a
module as plain text, so a write in a comment of a module counts toward ownership.

The rule reads the modules of a folder only when a test in that folder writes a table, and reads
each folder once while oxlint keeps the plugin loaded. The plugin passes the rule its folder reader,
so a test of the rule can count the folders it reads.

## `zgeoff/test-beside-seed`

A `seed-<name>.ts` or `seed-<name>.tsx` file needs a test beside it, which asserts the rows and
files that the seed writes. A sibling `seed-<name>.test.ts`, `seed-<name>.test.tsx` or lane suite,
such as `seed-<name>.host.test.ts`, counts. The rule reports at the first statement, so a file-level
disable comment covers it.
