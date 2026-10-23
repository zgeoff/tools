# oxlint-config test-file rules

Five rules of the `zgeoff/*` plugin in `@zgeoff/oxlint-config` check test files.
`zgeoff/test-beside-module` keeps each test file beside the module it tests,
`zgeoff/setup-test-only` keeps a test file's module level to `setupTest()` and its tests,
`zgeoff/no-file-snapshot` bans file snapshots, `zgeoff/max-test-timeout` keeps each test outside a
lane to the default timeout, and `zgeoff/no-test-sleep` bans a fixed delay in a test file. The
[config overview](./oxlint-config.md) covers the rest of the config.

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

## `zgeoff/max-test-timeout`

A test outside a lane keeps the default timeout of `bun test`, because a test that needs longer does
a lane's work. The rule reports, in any linted file, a timeout above that default:

- a number argument after the name of a `test`, `it` or `describe` call, or of a chain of their
  modifiers, such as `test.skipIf(gate).each(rows)(…)`;
- the `timeout` of an options object in the same place;
- the argument of `setDefaultTimeout`.

The names come from `bun:test`, under their imported names when an import renames them or as members
of a namespace import, or are the globals that `bun test` defines. A name bound any other way, such
as an import from another module, is not checked. The rule reads a number literal, arithmetic on
number literals, and a `const` that holds one of them; it leaves any other value unreported, such as
one read from the environment.

A lane file is exempt: each file under the `e2e/` directory at the repo root, which
`zgeoff/test-beside-module` anchors the same way, and each `<name>.<lane>.test.ts` or `.test.tsx`
file whose lane is `browser`, `docker`, `host` or one that the `lanes` option declares. A declared
lane is also the name of a `test:<lane>` script that the test timeout check exempts:

```json
{ "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": ["binary"] }] } }
```

### The test timeout check

oxlint lints only JavaScript and TypeScript files, so it cannot read a `package.json` script or a
`bunfig.toml`. The pre-push baseline's
[`run-test-timeouts-check.ts`](../../sync/pre-push/run-test-timeouts-check.ts) reads them as `HEAD`
holds them, as the `test-timeouts` job before a push and the `Check test timeouts` step of the
shared pull-request checks. It reports:

- each `--timeout` above the default, in either the `--timeout 20000` or the `--timeout=20000` form,
  among the words after `bun test` in a `package.json` script, where a quoted or escaped word is a
  value and never a flag, and an `echo` or `printf` command runs no `bun test`;
- each `bunfig.toml` whose `[test] timeout` is above the default.

It exempts the `test:related` script, which runs the shared related-test runner, and each lane
script: `test:e2e`, `test:browser`, `test:docker`, `test:host`, and `test:<lane>` for each lane in
the `lanes` option of `zgeoff/max-test-timeout` in the root `.oxlintrc.json`.

## `zgeoff/no-test-sleep`

A test waits on a condition, never a fixed delay, as the testing skill requires. In a
`<name>.test.ts` or `<name>.test.tsx` file, lane suites included, the rule reports:

- `Bun.sleep` and `Bun.sleepSync`;
- the `sleep` and `sleepSync` of the `bun` module, and the `setTimeout` of `node:timers/promises` or
  `timers/promises`, under any local name or read through a namespace or default import;
- a `setTimeout` or `globalThis.setTimeout` call inside the executor of a `new Promise`.

A sleep inside a wait helper passes. A wait helper is a function whose name starts with `waitFor` or
`waitUntil`, followed by the end of the name or a capital letter, such as `waitForExit` or
`waitUntilIdle`. Its name comes from its declaration, or from the variable, the object key or the
method that holds it. A sleep inside a function that the helper holds passes too, so a helper may
poll its condition in a loop with a short sleep between reads. `waitForward` is not a wait helper.
