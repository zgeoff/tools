import { expect, test } from 'bun:test';
import { buildLefthookExtends } from './build-lefthook-extends.ts';

test('it writes a config that extends the baseline when the repo has no lefthook.yml', () => {
  expect(buildLefthookExtends(null)).toStrictEqual({
    kind: 'changed',
    text: 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
  });
});

test('it puts the extends list above a config that has none, and keeps the rest', () => {
  const text = '# Git hooks.\npre-commit:\n  jobs:\n    - name: oxfmt\n      run: oxfmt\n';

  expect(buildLefthookExtends(text)).toStrictEqual({
    kind: 'changed',
    text: `extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n\n${text}`,
  });
});

test('it adds the baseline to an extends list that lacks it, and keeps the other entries', () => {
  const text = 'extends:\n  - .lefthook/local.yml\n\npre-push:\n  jobs: []\n';

  expect(buildLefthookExtends(text)).toStrictEqual({
    kind: 'changed',
    text: 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n  - .lefthook/local.yml\n\npre-push:\n  jobs: []\n',
  });
});

test('it leaves a config that already extends the baseline unchanged', () => {
  expect(
    buildLefthookExtends('extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n'),
  ).toStrictEqual({ kind: 'unchanged' });
});

test('it refuses an extends list written inline', () => {
  expect(buildLefthookExtends('extends: [.lefthook/local.yml]\n')).toStrictEqual({
    kind: 'refused',
    reason:
      'lefthook.yml writes extends in a form chex init does not edit; add node_modules/@zgeoff/chex/lefthook.yml to its list',
  });
});

test('it refuses a config that is no YAML mapping', () => {
  expect(buildLefthookExtends('- one\n- two\n')).toStrictEqual({
    kind: 'refused',
    reason: 'lefthook.yml is not a YAML mapping',
  });
});

test('it puts the extends list inside the document of a config that starts with a document marker', () => {
  const text = '# Git hooks.\n---\npre-push:\n  jobs: []\n';

  expect(buildLefthookExtends(text)).toStrictEqual({
    kind: 'changed',
    text: '# Git hooks.\n---\nextends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n\npre-push:\n  jobs: []\n',
  });
});

test('it refuses a config written as a flow mapping, which an extends line above would break', () => {
  expect(buildLefthookExtends('{ pre-push: { jobs: [] } }\n')).toStrictEqual({
    kind: 'refused',
    reason:
      'lefthook.yml is laid out in a form chex init does not edit; add an extends list that names node_modules/@zgeoff/chex/lefthook.yml',
  });
});

test('it refuses a config that holds a second YAML document, which the edit would leave out', () => {
  expect(
    buildLefthookExtends('pre-push:\n  jobs: []\n---\npre-commit:\n  jobs: []\n'),
  ).toStrictEqual({
    kind: 'refused',
    reason: 'lefthook.yml is not a YAML mapping',
  });
});
