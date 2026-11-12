# The test layout

[`chex`](../../packages/chex/README.md) runs `chex test-layout` to check where a repo keeps its
tests. It reads the files git tracks and the imports of each source file, and prints one fault per
line, each with the fix. It reads the workspace packages from the `workspaces` field of the root
`package.json`, and a repo without the field is one package. The lane suffixes come from the
standard lanes, the lanes of `.oxlintrc.json` and the resolved lanes of `rig.config.ts`. A lane that
`rig.config.ts` gives another suffix has only that suffix. It fails:

- a root `e2e/` or `test-utils/` folder, a root `evals/` or `bench/` folder in a workspace repo, and
  any folder named `test`, `tests`, `__tests__` or `integration`. A package keeps its helpers in
  `src/test-utils/`, and a top-level folder outside the workspaces may keep its own `test-utils/`.
- a subfolder in `e2e/` other than `e2e/fixtures/`, a subfolder in `bench/`, and a subfolder below
  `evals/<name>/`.
- an `e2e/*.test.ts` file whose name does not start with `start-`, `stop-`, `recover-`, `cli-`,
  `build-`, `runtime-`, `enforce-`, `compat-` or `journey-`.
- a `src/**/<base>.test.ts` file with no `<base>.<ext>` beside it. For `<base>.<word>.test.ts`, a
  lane suffix `.<word>` needs `<base>.<ext>` beside it, and any other word needs
  `<base>.<word>.<ext>` beside it, as the test of a module whose name holds a dot. Outside `src/`, a
  suffix that is neither a lane's nor a module's is a fault too.
- a relative import of another workspace's test helper, and a test helper imported from production
  code.

## Keep a folder outside the layout

When a repo keeps a test folder outside the layout on purpose, declare the folder in the root
`package.json`, with the reason:

```json
{
  "chex": {
    "testLayout": {
      "departures": [
        { "path": "e2e/", "reason": "one e2e lane spans the server and the CLI packages" }
      ]
    }
  }
}
```

A departure drops the fault of where that one folder sits: a root `e2e/`, `evals/`, `bench/` or
`test-utils/` folder, a `test`, `tests`, `__tests__` or `integration` folder, a package's
`test-utils/` outside `src/`, or a subfolder of `e2e/`, `bench/` or `evals/<name>/`. Every other
fault still applies to the files in the folder, such as a test helper imported by a relative path, a
test helper imported from production code, a subfolder of the declared folder, and a test file name.

- Write `path` relative to the repo root, ending in `/`, with no `./`, `../` or leading `/`.
- `reason` can't be blank.
- Remove a departure when you remove its folder. `chex test-layout` fails a departure whose folder
  holds no file that git tracks.
- `chex test-layout` exits 2 and prints the field when the `chex` field does not parse, such as for
  a misspelt key.
