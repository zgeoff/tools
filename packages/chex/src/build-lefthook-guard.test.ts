import { expect, test } from 'bun:test';
import { buildInitGuardHooks } from '../../../test-utils/build-init-guard-hooks.ts';
import { buildLefthookGuard } from './build-lefthook-guard.ts';

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
