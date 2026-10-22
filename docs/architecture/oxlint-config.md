# @zgeoff/oxlint-config

`@zgeoff/oxlint-config` is the shareable oxlint config of the zgeoff repos, with a bundled JS plugin
of `zgeoff/*` rules for the shapes that no native oxlint rule can express. This doc covers the
config's ban on type assertions, its comment rules, and `zgeoff/no-restricted-words`. Three more
docs cover the plugin's other rules: [code style](./oxlint-config-code-style.md),
[test files](./oxlint-config-tests.md) and [import zones](./oxlint-config-import-zones.md). The
[package README](../../packages/oxlint-config/README.md) holds the install and the setup.

The plugin's other rules each check one convention. `zgeoff/function-verb` bans the vague and
near-synonym verbs of the shared function-naming rules, `zgeoff/verb-contract` checks the promise
each role-table verb makes, `zgeoff/module-order` keeps a file in the shared module order,
`zgeoff/test-beside-module` keeps each test file beside the module it tests, `zgeoff/import-zones`
fails an import that crosses a module boundary the repo declares, `zgeoff/no-restricted-words` keeps
the words in its `words` option out of a path's text, `zgeoff/no-abbreviated-names` reports each
abbreviated value name it lists with its full word, `zgeoff/no-file-snapshot` bans file snapshots,
`zgeoff/setup-test-only` keeps a test file's module level to `setupTest()` and its tests, and
`zgeoff/no-class` bans every class but a custom error.

## Type assertions

`typescript/consistent-type-assertions` runs with `assertionStyle: "never"`, so every type assertion
fails: `x as T`, `<T>x` and `x as unknown as T`. `as const` and `satisfies` pass, because neither
claims a type the checker cannot prove. `typescript/no-unsafe-type-assertion` is off, because the
ban reports every assertion that rule checks.

Replace an assertion with a type guard, a type annotation, `satisfies`, or a typed helper from
`@zgeoff/std`. An assertion that survives carries a disable comment on the line above it, with its
approval and reason after `--`:

```ts
// oxlint-disable-next-line typescript/consistent-type-assertions -- approved <issue>: <reason>
```

`zgeoff/no-hidden-cast` reports a claim of a type that has no `as` for the ban to see:

- a type argument on a `sql` tagged template, such as Kysely's `sql<T>`;
- a call to Kysely's `$castTo()`, `$narrowType()` or `$assertType()`;
- a type argument on a `query()` or `prepare()` call, such as bun:sqlite's;
- a type argument on Pulumi `Config`'s `getObject()`, `requireObject()`, `getSecretObject()` or
  `requireSecretObject()`.

The rule needs no type information, so it matches by name: a method of another library with the same
name and a type argument is reported too. Read such a value as `unknown` and parse it with zod, or
query through Kysely over declared table types.

Every repo runs both rules as this config ships them. `zgeoff/no-comment-rule-override` reports a
repo-root `.oxlintrc*.json` that sets either rule under any plugin prefix, so a disable comment on
the line is the only way to keep an assertion.

## `zgeoff/no-jsdoc` and `zgeoff/max-consecutive-line-comments`

A comment holds only what neither the code, a type, a test name, nor the subsystem doc can hold: the
reason a line does the non-obvious thing. `no-jsdoc` reports every `/** … */` block (inline
`@type`/`@lends` casts exempt). `max-consecutive-line-comments` reports a run of own-line `//`
comments longer than `max` (default 3); tool directives (`oxlint-`, `eslint-`, `@ts-`, …) neither
count nor join the prose around them. Neither rule fixes: a deleted comment is a decision, not a
whitespace change.

Every repo runs both rules as this config ships them. `zgeoff/no-comment-rule-override` reports a
repo-root `.oxlintrc*.json` that sets either rule, once per lint run, so a repo cannot turn them off
or loosen `max`.

## `zgeoff/no-restricted-words`

Off unless a repo configures it. The `words` option lists the words to keep out of the text of a
file: string literals, template text and comments. A word matches whole and without case, so `imp`
reports `'IMP daemon'` and `'imp-e2e'` but not `'impl'` or `'imp_name'`. Identifiers are code, not
text, and the rule never reads them. Scope the rule to a path with `overrides`, and turn it off for
the paths that may name the words:

```jsonc
{
  "rules": {
    "zgeoff/no-restricted-words": ["error", { "words": ["imp", "impd"] }],
  },
  "overrides": [
    { "files": ["packages/execution/**"], "rules": { "zgeoff/no-restricted-words": "off" } },
  ],
}
```
