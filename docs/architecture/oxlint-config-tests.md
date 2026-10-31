# oxlint-config test-file rules

Seven rules of the `zgeoff/*` plugin in `@zgeoff/oxlint-config` check test files.
`zgeoff/test-beside-module` keeps each test file beside the module it tests,
`zgeoff/setup-test-only` keeps a test file's module level to `setupTest()` and its tests,
`zgeoff/test-shape` keeps a `bun:test` file to flat `test()` calls with titled behaviour,
`zgeoff/no-file-snapshot` bans file snapshots, `zgeoff/max-test-timeout` keeps each test within the
time limit of its lane, `zgeoff/test-timeout-exception-ticket` makes each disable of that rule name
a ticket or a floor, and `zgeoff/no-test-sleep` bans a fixed delay in a test file. The
[config overview](./oxlint-config.md) covers the rest of the config.

## `zgeoff/test-beside-module`

A `<name>.test.ts` or `<name>.test.tsx` file needs a non-test file `<name>.<ext>` in the same
directory — `.ts`, `.tsx`, `.sh`, `.json`, or any other single extension, so `install.test.ts` may
test `install.sh`. The suite directories are exempt, and no other directory is: `e2e/`,
`integration/` and `evals/` at the repo root (the nearest ancestor holding `.git`, else oxlint's
working directory) or in an app root (a directory that holds a `package.json`), and every package
whose directory name ends in `-e2e`. Exempt any other test with a file-level disable comment that
states the reason. The rule reports at the first statement, so put the comment above it:

```ts
// oxlint-disable zgeoff/test-beside-module -- tests base.json and react.json together
```

A lane suite, such as `<name>.browser.test.ts`, tests the same module as `<name>.test.ts` and needs
only `<name>.<ext>`; the suffix lets the repo's test script run the suite in its own lane. The rule
treats the standard lanes of `zgeoff/max-test-timeout` as lanes with no configuration. A repo that
has a [`rig.config.ts`](./rig.md#one-source-for-the-limits) takes its lanes from that file, and the
rule reports a `lanes` option there, once per file, because the option would give the lanes a second
source. A repo without one adds its own lanes with the `lanes` option, in either of that rule's
forms, and the standard lanes stay beside them:

```json
{ "rules": { "zgeoff/test-beside-module": ["error", { "lanes": { "kvm": 60000 } }] } }
```

Any other suffix is part of the name. A second test file for a module (`<name>.host.test.ts`) needs
its own `<name>.host.<ext>`, so the rule reports it beside only `<name>.ts`.

## `zgeoff/setup-test-only`

A `<name>.test.ts` or `<name>.test.tsx` file declares one function, `setupTest()`, and nothing else,
as the testing skill requires. At module level the rule allows imports, `type` and `interface`
declarations, one `setupTest` function declaration, and statements that call `test`, `test.each`,
`test.skipIf` or `test.if`, or a chain of them, with `test` under its local alias when the
`bun:test` or `claude-code/testing` import renames it. It reports every other statement: a `let`, a
`var`, a class, an enum, a second function, an export, and a call such as `expect(...)`. The message
holds the three ways out of a helper: inline it, swap it for a registered matcher, or move it to the
shared test utils with tests of its own.

A module-level call of `test.skip`, `test.todo`, `test.only` or `test.failing`, in any chain of
modifiers, reports with a message that names `test.skipIf(<condition>)`, the one skip the testing
skill allows. A call of `test.concurrent` reports with its own message too, because the tests that
register cleanup with `onTestFinished` must run in order.

In a file that imports `bun:test`, the rule leaves a call of Bun's `describe`, `it` or a hook,
through any chain of modifiers, to `zgeoff/test-shape`, so each such call gets one report, with the
advice that fits it. A call of a function with one of those names from another module still reports
here.

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

Each lane has a per-test time limit, and a test in the unit run keeps the default timeout of
`bun test`. A test that needs longer hides a cost that the testing skill's
[Slow tests](../../sync/skills/testing/SKILL.md#slow-tests) table names a fix for, so the rule
reports, in any linted file, a timeout above the limit of the file's lane:

- a number argument after the name of a `test`, `it` or `describe` call, or of a chain of their
  modifiers, such as `test.skipIf(gate).each(rows)(…)`;
- the `timeout` of an options object in the same place;
- the argument of `setDefaultTimeout`.

The names come from `bun:test`, under their imported names when an import renames them or as members
of a namespace import, or are the globals that `bun test` defines. A name bound any other way, such
as an import from another module, is not checked. The rule reads a number literal, arithmetic on
number literals, and a `const` that holds one of them; it leaves any other value unreported, such as
one read from the environment.

The file's lane comes from its suffix first, then its directory, because the default run leaves a
suffixed file out wherever it sits. A `<name>.<lane>.test.ts` or `.test.tsx` file is in its lane
when the lane is a standard one or one that the `lanes` option declares, except `e2e`, whose
directory alone selects it. Any other file under an `e2e/` directory or a `-e2e` package that
`zgeoff/test-beside-module` exempts is in the `e2e` lane, and every other file is in the unit run,
`integration/` and `evals/` included. The standard lanes and their limits are the ones in the
skill's [Lanes](../../sync/skills/testing/references/slow-tests.md#lanes) table, which a test of the
rule pins. A repo with a `rig.config.ts` gets every lane and limit from the table that file
resolves, and the rule reports a `lanes` option there as `zgeoff/test-beside-module` does. In a repo
without one, the `lanes` option maps a lane to its limit in milliseconds, and an entry adds a
project lane or changes the limit of a standard one:

```json
{ "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": { "kvm": 60000 } }] } }
```

The option also takes a list of lane names. Each listed lane that is not standard gets the limit of
the `e2e` lane, so a config that lists lane names keeps passing lint until it states each limit.

A test over its lane's limit carries a disable comment whose reason gives the measured time and
either a ticket or `floor:` with the evidence that the time cannot move, as the skill's
[A test over its limit](../../sync/skills/testing/references/slow-tests.md#a-test-over-its-limit)
shows. oxlint honours the comment with its reason, and `zgeoff/test-timeout-exception-ticket` reads
the reason.

### The test timeout check

oxlint lints only JavaScript and TypeScript files, so it cannot read a `package.json` script or a
`bunfig.toml`. The pre-push baseline's
[`run-test-timeouts-check.ts`](../../packages/chex/src/run-test-timeouts-check.ts) reads them as
`HEAD` holds them, as the `test-timeouts` job before a push and the `Check test timeouts` step of
the shared pull-request checks. It reports:

- each `--timeout` above the script's limit, and each `--timeout` of 0, which Bun reads as no
  timeout, in either the `--timeout 20000` or the `--timeout=20000` form. The check reads the words
  that a `bun test` command in a `package.json` script hands Bun after the shell removes quotes and
  escapes, up to `--`. Options may come before `test` in the `--name=value` form, as in
  `bun --no-env-file test`. A newline or an operator such as `&&` ends a command, and a command
  named `echo` or `printf`, quoted or bare, runs no `bun test`;
- each `bunfig.toml` whose `[test] timeout` is above the limit of its directory's lane;
- each setting in an oxlint config, at any depth of the tree, that turns `zgeoff/max-test-timeout`
  or `zgeoff/test-timeout-exception-ticket` off or down to a warning, unless a comment on its line,
  directly above it, or directly above its override names a ticket or a `floor:`. Such a setting
  escapes the limits as a disable comment does.

A `test:<lane>` script gets the limit of its lane, and every other script gets the unit limit. The
check exempts the `test:related` script, which runs the shared related-test runner. It reads the
lanes from the `lanes` option of `zgeoff/max-test-timeout` in the root `.oxlintrc.json`, with the
same standard lanes as the rule. The check keeps its own copy of the standard limits, because the
shared pull-request checks download it without the oxlint config package, and a test pins both
copies to the skill's table.

## `zgeoff/test-shape`

A `<name>.test.ts` or `<name>.test.tsx` file that imports `bun:test` keeps the structure rules of
the testing skill. oxlint's own jest and vitest rules match only their runners' imports, so they
miss a `bun:test` file. The rule reports:

- a call of `describe`, `it`, `beforeAll`, `beforeEach`, `afterAll` or `afterEach`, or of one of
  their modifiers, such as `describe.each` or `describe['only']`;
- a `toEqual` matcher on a value that `expect` made, read by name or by a string key such as
  `['toEqual']`;
- a `test()` title, in any modifier or `test.each` form, that starts with neither `it ` nor a
  `#<unit> ` prefix, where the unit may be a dotted path such as `#sessions.enrol`;
- a `bun:test` import that renames a binding or takes the namespace, so each call reads as the name
  that `bun:test` gives it.

Each of these checks applies only to Bun's own function: the name at the root of the call resolves
to an import from `bun:test`, or to a global that the file never declares, which Bun's runner
provides. A `describe` imported from another module, or a `toEqual` method of another object,
passes.

A title held in a variable or built by a call passes, because the rule reads only a string or a
template literal. A file that imports another runner, or only types from `bun:test`, is left alone.

## `zgeoff/test-timeout-exception-ticket`

The rule reports each comment that disables `zgeoff/max-test-timeout`, in any of the
`oxlint-disable` or `eslint-disable` forms, whose reason after `--` holds neither a ticket ID such
as `OPS-212` nor `floor:` followed by text. It reads the comments that oxlint's parser finds, so a
directive-shaped string or template in a test fixture is not a comment. It is a rule of its own
because a disable of `zgeoff/max-test-timeout` would suppress a report under that rule's name on the
lines the disable covers.

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
