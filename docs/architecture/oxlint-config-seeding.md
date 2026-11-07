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
- a string or a template literal that holds an `INSERT … INTO`, an `UPDATE … SET` or a `DELETE FROM`
  statement. The rule reads these keywords in upper case only, so a test title that says "update"
  never counts.

A write passes in these places:

- inside a function whose name starts with `seed`, in a file under `test-utils`. A seed writes
  directly only for a state that no code in the repo makes;
- in the owner's own tests: a test file whose folder holds a module, other than a test or a
  declaration file, that writes the same table. The rule compares table names without the schema, an
  alias, quotes or letter case;
- in a migration test: a test file whose path below the repo root holds `migrate` or `migration`;
- in a seed's own test: a `seed-<name>.test.ts` file under `test-utils`.

A test of code whose product is SQL or storage, such as a database dialect, takes a file-level
disable comment, with the case as its reason:

```ts
// oxlint-disable zgeoff/seed-only -- tests the dialect, whose product is SQL
```

The rule finds a table's owner by the table's name, so outside a seed it reports a table name that
is not a string literal, such as a variable or an interpolation in the statement. The rule reads a
module as plain text, so a write in a comment of a module counts toward ownership.

The rule reads the modules of a folder only when a test in that folder writes a table, and reads
each folder once per oxlint run. The plugin passes the rule its folder reader, so a test of the rule
can count the folders it reads.

## `zgeoff/test-beside-seed`

A `seed-<name>.ts` or `seed-<name>.tsx` file needs a test beside it, which asserts the rows and
files that the seed writes. A sibling `seed-<name>.test.ts`, `seed-<name>.test.tsx` or lane suite,
such as `seed-<name>.host.test.ts`, counts. The rule reports at the first statement, so a file-level
disable comment covers it.
