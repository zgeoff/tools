import { expect, test } from 'bun:test';
import { buildJobLeakCases } from './build-job-leak-cases.ts';
import { runBaselineJobsCheck } from './run-baseline-jobs-check.ts';

function setupTest() {
  const output: string[] = [];

  const run = (configText: string) =>
    runBaselineJobsCheck({
      configText,
      cases: buildJobLeakCases(configText),
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const templates = 'templates:\n  clear-git-env: unset $(git rev-parse --local-env-vars);\n';

  return { output, run, templates };
}

test("it fails a job that runs with git's repository variables and names them", async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run(
    `${ctx.templates}pre-commit:\n  jobs:\n    - name: kettle\n      run: '{clear-git-env} bun x --no-install diet -- true'\n    - name: lid\n      run: bun x --no-install diet -- true\n`,
  );

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    "baseline-jobs: the pre-commit job lid runs without git's repository variables: it kept GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE\n",
  ]);
});

test('it fails a job that never reaches diet', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run('pre-push:\n  jobs:\n    - name: spout\n      run: exit 0\n');

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    "baseline-jobs: the pre-push job spout runs without git's repository variables: it never ran diet\n",
  ]);
});

test("it fails a files command that keeps git's repository variables", async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run(
    `${ctx.templates}pre-push:\n  jobs:\n    - name: kettle\n      files: bun node_modules/@zgeoff/chex/src/read-branch-files.ts\n      run: '{clear-git-env} bun x --no-install diet -- true'\n`,
  );

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    "baseline-jobs: the pre-push job kettle lists its files without git's repository variables: its files command kept GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE\n",
  ]);
});

test('it passes jobs that clear the variables and prints nothing', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run(
    `${ctx.templates}pre-commit:\n  jobs:\n    - name: kettle\n      run: '{clear-git-env} bun x --no-install diet -- true'\n`,
  );

  expect(exitCode).toBe(0);
  expect(ctx.output).toStrictEqual([]);
});
