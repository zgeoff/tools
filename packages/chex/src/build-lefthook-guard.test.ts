import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv } from '@zgeoff/std/test-utils/read-git-env';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { buildLefthookGuard } from './build-lefthook-guard.ts';
import { buildInitGuardHooks } from './test-utils/build-init-guard-hooks.ts';

async function setupTest() {
  const repo = await mkdtemp(join(tmpdir(), `build-lefthook-guard-pid${process.pid}-`));

  onTestFinished(() => rm(repo, { recursive: true, force: true }));

  const env = readGitEnv(repo);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  return { repo, env, lefthook: join(import.meta.dir, '../../../node_modules/.bin/lefthook') };
}

test('it adds pre-commit and pre-push hooks that run only the guard to a config that has neither', () => {
  const text = 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n';

  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'changed',
    text: `${text}${buildInitGuardHooks()}`,
  });
});

test("it puts the guard above a hook's first job and its comment, and keeps the hook's other keys", () => {
  const text =
    'pre-commit:\n  piped: true\n  jobs:\n    # Fixes the staged files.\n    - name: oxfmt\n      run: oxfmt\n\n' +
    'pre-push:\n  jobs:\n    - name: test\n      run: bun test\n';

  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'changed',
    text:
      'pre-commit:\n  piped: true\n  jobs:\n' +
      '    - name: chex-baseline\n' +
      '      files: echo package.json\n' +
      '      run: |\n' +
      '        if [ ! -f node_modules/@zgeoff/chex/lefthook.yml ]; then\n' +
      '          echo "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline\'s jobs; run bun install, then try again"\n' +
      '          exit 1\n' +
      '        fi\n' +
      '        # {files}\n' +
      '    # Fixes the staged files.\n    - name: oxfmt\n      run: oxfmt\n\n' +
      'pre-push:\n  jobs:\n' +
      '    - name: chex-baseline\n' +
      '      files: echo package.json\n' +
      '      run: |\n' +
      '        if [ ! -f node_modules/@zgeoff/chex/lefthook.yml ]; then\n' +
      '          echo "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline\'s jobs; run bun install, then try again"\n' +
      '          exit 1\n' +
      '        fi\n' +
      '        # {files}\n' +
      '    - name: test\n      run: bun test\n',
  });
});

test('it writes the guard at the indent of the jobs the list already holds', () => {
  const text = 'pre-commit:\n  jobs:\n  - name: oxfmt\n    run: oxfmt\n';

  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'changed',
    text:
      'pre-commit:\n  jobs:\n' +
      '  - name: chex-baseline\n' +
      '    files: echo package.json\n' +
      '    run: |\n' +
      '      if [ ! -f node_modules/@zgeoff/chex/lefthook.yml ]; then\n' +
      '        echo "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline\'s jobs; run bun install, then try again"\n' +
      '        exit 1\n' +
      '      fi\n' +
      '      # {files}\n' +
      '  - name: oxfmt\n    run: oxfmt\n' +
      '\npre-push:\n  jobs:\n' +
      '    - name: chex-baseline\n' +
      '      files: echo package.json\n' +
      '      run: |\n' +
      '        if [ ! -f node_modules/@zgeoff/chex/lefthook.yml ]; then\n' +
      '          echo "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline\'s jobs; run bun install, then try again"\n' +
      '          exit 1\n' +
      '        fi\n' +
      '        # {files}\n',
  });
});

test('it leaves a config that already runs the guard in both hooks unchanged', () => {
  const text = `extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n${buildInitGuardHooks()}`;

  expect(buildLefthookGuard(text)).toStrictEqual({ kind: 'unchanged', text });
});

test('it refuses a config whose guard job differs from the one chex init writes', () => {
  const text = 'pre-commit:\n  jobs:\n    - name: chex-baseline\n      run: exit 0\n';

  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'refused',
    reason:
      'lefthook.yml has a chex-baseline job under pre-commit that differs from the one chex init writes; remove it, then run chex init again',
  });
});

test.each([
  ['a flow list of jobs', 'pre-commit:\n  jobs: []\n'],
  ['commands in place of jobs', 'pre-commit:\n  commands:\n    oxfmt:\n      run: oxfmt\n'],
  ['a flow mapping', 'pre-commit: { jobs: [{ name: oxfmt, run: oxfmt }] }\n'],
])('it refuses a hook written as %s', (_label, text) => {
  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'refused',
    reason:
      'lefthook.yml writes pre-commit in a form chex init does not edit; write its pre-commit jobs as a block list, then run chex init again',
  });
});

test.each([['pre-commit'], ['pre-push']])(
  'it fails the %s hook and names the missing baseline in a checkout with no node_modules, though the hook gets no file',
  async (hook) => {
    const ctx = await setupTest();

    // A repo as chex init leaves it before its first install: lefthook.yml extends the baseline,
    // and node_modules does not exist.
    const guarded = buildLefthookGuard('extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n');

    invariant(
      guarded.kind === 'changed',
      'chex adds the guard to a config that extends the baseline',
    );

    await writeFile(join(ctx.repo, 'lefthook.yml'), guarded.text);
    await writeFile(join(ctx.repo, 'package.json'), '{ "name": "kettle" }\n');

    const result = await $`${process.execPath} ${ctx.lefthook} run ${hook}`
      .cwd(ctx.repo)
      .env({ ...ctx.env })
      .nothrow()
      .quiet();

    const output = `${result.stdout.toString()}${result.stderr.toString()}`;

    expect(result.exitCode).toBe(1);

    expect(output).toInclude(
      "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline's jobs; run bun install, then try again",
    );
  },
);
