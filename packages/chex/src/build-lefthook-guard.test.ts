import { expect, test } from 'bun:test';
import { buildLefthookGuard } from './build-lefthook-guard.ts';

// The guard job as chex init writes it, at an item indent of four spaces.
function setupTest() {
  const guardJob =
    '    - name: chex-baseline\n' +
    '      run: |\n' +
    '        if [ ! -f node_modules/@zgeoff/chex/lefthook.yml ]; then\n' +
    '          echo "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline\'s jobs; run bun install, then try again"\n' +
    '          exit 1\n' +
    '        fi\n';

  return { guardJob };
}

test('it adds pre-commit and pre-push hooks that run only the guard to a config that has neither', () => {
  const ctx = setupTest();
  const text = 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n';

  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'changed',
    text: `${text}\npre-commit:\n  jobs:\n${ctx.guardJob}\npre-push:\n  jobs:\n${ctx.guardJob}`,
  });
});

test("it puts the guard above a hook's first job and its comment, and keeps the hook's other keys", () => {
  const ctx = setupTest();

  const text =
    'pre-commit:\n  piped: true\n  jobs:\n    # Fixes the staged files.\n    - name: oxfmt\n      run: oxfmt\n\n' +
    'pre-push:\n  jobs:\n    - name: test\n      run: bun test\n';

  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'changed',
    text:
      `pre-commit:\n  piped: true\n  jobs:\n${ctx.guardJob}    # Fixes the staged files.\n    - name: oxfmt\n      run: oxfmt\n\n` +
      `pre-push:\n  jobs:\n${ctx.guardJob}    - name: test\n      run: bun test\n`,
  });
});

test('it writes the guard at the indent of the jobs the list already holds', () => {
  const ctx = setupTest();
  const text = 'pre-commit:\n  jobs:\n  - name: oxfmt\n    run: oxfmt\n';

  expect(buildLefthookGuard(text)).toStrictEqual({
    kind: 'changed',
    text:
      `pre-commit:\n  jobs:\n${ctx.guardJob.replaceAll(/^ {2}/gmu, '')}  - name: oxfmt\n    run: oxfmt\n` +
      `\npre-push:\n  jobs:\n${ctx.guardJob}`,
  });
});

test('it leaves a config that already runs the guard in both hooks unchanged', () => {
  const ctx = setupTest();
  const text = `pre-commit:\n  jobs:\n${ctx.guardJob}\npre-push:\n  jobs:\n${ctx.guardJob}`;

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
  ['a flow list of jobs', 'pre-push:\n  jobs: []\n'],
  ['commands in place of jobs', 'pre-push:\n  commands:\n    test:\n      run: bun test\n'],
  ['a flow mapping', 'pre-push: { jobs: [{ name: test, run: bun test }] }\n'],
])('it refuses a hook written as %s', (_label, text) => {
  const ctx = setupTest();

  expect(buildLefthookGuard(`pre-commit:\n  jobs:\n${ctx.guardJob}${text}`)).toStrictEqual({
    kind: 'refused',
    reason:
      'lefthook.yml writes pre-push in a form chex init does not edit; write its pre-push jobs as a block list, then run chex init again',
  });
});

test("it finds the guard that chex init writes in both hooks of this repo's lefthook.yml", async () => {
  const text = await Bun.file(`${import.meta.dir}/../../../lefthook.yml`).text();

  expect(buildLefthookGuard(text)).toStrictEqual({ kind: 'unchanged', text });
});
