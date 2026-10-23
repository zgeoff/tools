# oxlint-config test-file rules

Three rules of the `zgeoff/*` plugin in `@zgeoff/oxlint-config` check test files.
`zgeoff/test-beside-module` keeps each test file beside the module it tests,
`zgeoff/setup-test-only` keeps a test file's module level to `setupTest()` and its tests, and
`zgeoff/no-file-snapshot` bans file snapshots. The [config overview](./oxlint-config.md) covers the
rest of the config.

## `zgeoff/test-beside-module`

A `<name>.test.ts` or `<name>.test.tsx` file needs a non-test file `<name>.<ext>` in the same
directory — `.ts`, `.tsx`, `.sh`, `.json`, or any other single extension, so `install.test.ts` may
test `install.sh`. Files under an `e2e/` or `evals/` directory at the repo root (the nearest
ancestor holding `.git`, else oxlint's working directory) are exempt; no other directory is. Exempt
any other test with a file-level disable comment that states the reason. The rule reports at the
first statement, so put the comment above it:

```ts
// oxlint-disable zgeoff/test-beside-module -- tests base.json and react.json together
```

A lane suite, such as `<name>.browser.test.ts`, tests the same module as `<name>.test.ts` and needs
only `<name>.<ext>`; the suffix lets the repo's test script run the suite in its own lane. The rule
treats `browser` as a lane with no configuration. A repo adds its own lanes with the `lanes` option,
and `browser` stays a lane beside them:

```json
{ "rules": { "zgeoff/test-beside-module": ["error", { "lanes": ["sdk"] }] } }
```

Any other suffix is part of the name. A second test file for a module (`<name>.host.test.ts`) needs
its own `<name>.host.<ext>`, so the rule reports it beside only `<name>.ts`.

## `zgeoff/setup-test-only`

A `<name>.test.ts` or `<name>.test.tsx` file declares one function, `setupTest()`, and nothing else,
as the testing skill requires. At module level the rule allows imports, `type` and `interface`
declarations, one `setupTest` function declaration, and statements that call `test`, `test.each`,
`test.skipIf` or `test.if`, or a chain of them, with `test` under its local alias when the
`bun:test` or `claude-code/testing` import renames it. It reports every other statement: a `let`, a
`var`, a class, an enum, a second function, an export, and a call such as `beforeEach(...)`. The
message holds the three ways out of a helper: inline it, swap it for a registered matcher, or move
it to the shared test utils with tests of its own.

A module-level `const` passes only as a skip gate: a declarator that binds at least one name, each
binding read, and read only at collection time, inside an argument of the test runner's `skipIf` or
inside the initializer of another gate. The runner is `test` as `bun:test` exports it, under its
local alias if the import renames it, or a chain of its modifiers, so `matrix.skipIf(rows)` is not a
gate read. A file that imports no `test` uses the global one, unless an import or a module-level
declaration of its own takes the name `test`. A read inside a function never counts, so a `skipIf`
in `setupTest()` or a test body leaves its `const` reported. A gate derived from an awaited probe
passes beside the probe, in the same declaration or its own, but consts that only read each other
never reach a `skipIf` and report. A `const` that nothing reads reports too, and so does a
declarator that binds nothing, such as `const {} = registerHooks()`. The rule does not check the
comment that the skill asks a gate to carry.

## `zgeoff/no-file-snapshot`

Snapshots are inline only, so the golden value sits in the test that pins it. The rule reports every
`toMatchSnapshot` and `toThrowErrorMatchingSnapshot`, which write a `.snap` file;
`toMatchInlineSnapshot` and `toThrowErrorMatchingInlineSnapshot` stay allowed. It also reports a
linted file that has a `__snapshots__/<file name>.snap` beside it, at the first statement, so a
file-level disable comment covers it. oxlint never visits a `.snap` file, so a snapshot file whose
test file is gone is not reported.
