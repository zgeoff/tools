# oxlint-config code-style rules

Five rules of the `zgeoff/*` plugin in `@zgeoff/oxlint-config` check the code-style skill's
conventions for names and module layout. `zgeoff/function-verb` and `zgeoff/verb-contract` check
function names against the skill's role table, `zgeoff/module-order` checks the order of a file's
declarations, `zgeoff/no-abbreviated-names` checks value names, and `zgeoff/no-class` bans classes.
The [config overview](./oxlint-config.md) covers the rest of the config.

## `zgeoff/function-verb`

The rule reports a function, method, or function-valued variable or property whose name starts with
a banned verb, and it names the role-table verb to use instead (`fetchUser` → use `read`). It also
reports a bare template prefix, such as a function named `on`. A name that does not start with a
lowercase letter passes. The `exemptNames` option lists names that a library contract fixes:

```jsonc
{
  "rules": {
    "zgeoff/function-verb": ["error", { "exemptNames": ["execute"] }],
  },
}
```

## `zgeoff/verb-contract`

The rule reads each named function's verb and reports a body that breaks the verb's promise. It
reads declared return types, since it runs without type information. It runs three checks:

- **No I/O behind a no-I/O verb.** A function named with `is`, `has`, `can`, `should`, `build`,
  `parse`, `format`, `render`, `pick`, `find`, `get`, `collect` or `to` must not be async or await.
  It must not call `fs`, `child_process`, `Bun.spawn`, `Bun.file`, `Bun.write`, Bun's `$` shell
  under any import form, `fetch` or a Kysely `execute`, and must not read `process.env` or
  `Bun.env`. It must not call a function whose verb is on the rule's effectful list, such as
  `readConfig` or `ctx.writeText`. That check skips a callee imported from a package, a global, a
  bare method name such as `map.set`, and a method on a value the function declares itself. I/O
  inside an unnamed callback counts against the named function around it. A local alias of an I/O
  source, such as `const read = fs.readFileSync` or `const { spawn } = Bun`, counts as that source,
  and a local alias of a package's callee is skipped as the callee is.
- **Predicates return a boolean.** A function named with `is`, `has`, `can`, `should` or `probe`
  that declares a return type declares `boolean`, a type predicate, or a promise of one. A function
  that declares `boolean` and does no I/O starts with one of the four no-I/O predicate verbs. That
  check skips an effectful verb or `try`, whose function may return a success flag, and the
  framework prefixes `use`, `on` and `handle`.
- **`find` can miss, and `get` cannot.** A declared `find` return type holds `null`, `undefined`,
  `void`, `unknown` or `any`. A `get` function neither declares `null` or `undefined` nor returns
  either one as a literal or a bare `return`. Every check follows the file's own type aliases, and a
  type the rule cannot see, such as an import, a type parameter or an indexed access, never fails a
  check.

A test in this package reads the role table in the shared code-style skill, at the zgeoff/skills
commit that `sync/skills-pin.json` pins, and fails when the skill's no-I/O verbs and the rule's
differ in either direction.

## `zgeoff/module-order`

The rule checks the module order of the shared code-style skill in each file with a primary export.
The primary export is the default export, else the export whose name the file name kebab-cases, else
the file's only exported function or const. A file without one, such as a test file, passes. The
rule reports three breaks:

- **A helper first.** A private function sits above the primary export.
- **A helper out of composition order.** The helpers below the primary export follow it depth-first,
  each in the order its first reference appears.
- **A declaration away from its first use.** A const, type alias, interface or enum sits below its
  first use, or a helper sits between it and that use. A declaration the primary export uses may sit
  just above it.

The config's `import/first` rule reports an import after other code, so this rule leaves imports
alone. The rule leaves a const unchecked when a helper that runs as the module loads reads it,
because the const has to sit above the code that calls that helper.

`--fix` moves each declaration it can move without a change in behaviour, with the comments above
it, in one pass. A function declaration is hoisted and a type has no value, so both always move. A
const moves only when every use sits in a function body that runs after the module loads, and its
value is static. A static value runs no code and reads nothing that load-time code can change: a
literal, a function, an array, object, `new Set`, `new Map` or `new RegExp` over static values, or
an operator or template over primitive values, with an import only as a copied value. Any other
const stays where it is, and the rule still reports it. The fix makes no change when a move would
put a statement that ends without a semicolon before one that opens with a bracket or an operator.

## `zgeoff/no-abbreviated-names`

The `names` option maps each abbreviation to the text that replaces it, and the rule reports every
value name that has one of those names. A value name is any name that a declaration, an import, an
export alias, a key or a member write binds, so function, class and method names count beside
variables and properties. A key counts in each of its spellings, so `src`, `'src'`, `['src']` and
`#src` all report. A name matches whole, so `ms` reports `ms` but not `timeoutMs`.

The rule leaves alone the names that hold no value of their own. A destructured key that an alias
renames belongs to the object being read, so the rule reports only the alias. A computed key that
reads a variable, such as `[src]`, names no property, and the rule checks the variable at its
declaration. Type names, type-only imports and exports, labels and quoted module names hold no
value, so the rule skips them.

The shipped config lists the abbreviations that the code-style skill bans and turns on `id-length`
beside the rule, so a one-letter name fails too, other than `x`, `y`, `z`, `$` and `_`.

## `zgeoff/no-class`

Objects come from factory functions, as the code-style skill requires, so the rule reports every
class declaration and class expression, in test files too. A custom error stays a class, because
`instanceof` checks and stack traces need one. The rule counts a class as a custom error when its
`extends` clause holds `Error` or another name that ends in `Error`, bare or as a member such as
`errors.BrewError`. It does not check the name of the class itself, and it reports a superclass
reached through a computed member, such as `errors['BrewError']`.
