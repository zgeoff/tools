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
