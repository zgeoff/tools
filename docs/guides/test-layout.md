# The test layout

Run `chex test-layout` from [`chex`](../../packages/chex/README.md) to check where a repo keeps its
tests. It prints one fault per line, each with the fix, and exits 1 on a fault, 0 with none, and 2
when it cannot run.

The check reads the files git tracks and the imports of each source file. It takes the workspace
packages from the `workspaces` field of the root `package.json`, and treats a repo without the field
as one package. The lane suffixes come from the standard lanes, the lanes of `.oxlintrc.json` and
the resolved lanes of `rig.config.ts`. A lane that `rig.config.ts` gives another suffix has only
that suffix.

`chex test-layout` fails:

- a root `test-utils/` folder, in any repo.
- a root `e2e/`, `evals/` or `bench/` folder, in a repo with a `workspaces` field.
- any folder named `test`, `tests`, `__tests__` or `integration`.
- a package's `test-utils/` outside its `src/`.
- a subfolder in a package's `e2e/` other than `e2e/fixtures/`, a subfolder in its `bench/`, and a
  subfolder below its `evals/<name>/`. The package is a workspace, or the repo itself in a
  single-package repo.
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

For that one folder, `chex test-layout` then skips the fault of where the folder sits: a root
folder, a folder named `test`, `tests`, `__tests__` or `integration`, a package's `test-utils/`
outside `src/`, or a subfolder of a package's `e2e/`, `bench/` or `evals/<name>/`. It still reports
every other fault for the files in the folder, such as a relative import of another workspace's test
helper.

- Write `path` relative to the repo root, ending in `/`, with no `./`, `../` or leading `/`.
- Write a `reason` that is not blank.
- Remove a departure when you remove its folder. When git tracks no file in a departure's folder,
  `chex test-layout` reports the departure as a fault.
- `chex test-layout` exits 2 and prints the path of the bad field, such as
  `chex.testLayout.departures.0.path`, when the `chex` field breaks these rules or holds a misspelt
  key.
