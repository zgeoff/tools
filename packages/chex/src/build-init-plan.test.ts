import { expect, test } from 'bun:test';
import { buildInitGuardHooks } from '../../../test-utils/build-init-guard-hooks.ts';
import { buildInitPlan } from './build-init-plan.ts';

test('it plans the extends line and the check:docs script for a repo that has neither', () => {
  const packageText = JSON.stringify({
    name: 'kettle',
    scripts: { test: 'bun test' },
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  const editedText = `${JSON.stringify(
    {
      name: 'kettle',
      scripts: { test: 'bun test', 'check:docs': 'chex prose length links skill' },
      devDependencies: {
        '@zgeoff/chex': '0.1.0',
        '@zgeoff/diet': '0.1.2',
        '@zgeoff/rig': '0.0.2',
      },
    },
    null,
    2,
  )}\n`;

  expect(buildInitPlan(packageText, undefined)).toStrictEqual({
    kind: 'apply',
    writes: [
      {
        file: 'lefthook.yml',
        text: `extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n${buildInitGuardHooks()}`,
      },
      { file: 'package.json', text: editedText },
    ],
    notes: [
      'lefthook.yml extends node_modules/@zgeoff/chex/lefthook.yml',
      'lefthook.yml runs chex-baseline first in pre-commit and pre-push, which fails when node_modules/@zgeoff/chex/lefthook.yml is missing',
      'package.json runs "chex prose length links skill" as check:docs',
    ],
  });
});

test('it plans no write for a repo that already takes the baseline, and keeps its check:docs', () => {
  const packageText = JSON.stringify({
    name: 'kettle',
    scripts: { 'check:docs': 'chex length links vision' },
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  expect(
    buildInitPlan(
      packageText,
      `extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n${buildInitGuardHooks()}`,
    ),
  ).toStrictEqual({
    kind: 'apply',
    writes: [],
    notes: ['the repo already takes the baseline; nothing to change'],
  });
});

test('it refuses a repo that does not install rig and diet', () => {
  const packageText = JSON.stringify({ devDependencies: { '@zgeoff/chex': '0.1.0' } });

  expect(buildInitPlan(packageText, undefined)).toStrictEqual({
    kind: 'refused',
    reasons: [
      'the baseline needs @zgeoff/rig, @zgeoff/diet installed; run bun add -d @zgeoff/rig @zgeoff/diet',
    ],
  });
});

test('it refuses both edits when lefthook.yml writes extends as a single path', () => {
  const packageText = JSON.stringify({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  expect(buildInitPlan(packageText, 'extends: local.yml\n')).toStrictEqual({
    kind: 'refused',
    reasons: [
      'lefthook.yml writes extends in a form chex init does not edit; add node_modules/@zgeoff/chex/lefthook.yml to its list',
    ],
  });
});

test('it refuses a folder with no package.json', () => {
  expect(buildInitPlan(undefined, undefined)).toStrictEqual({
    kind: 'refused',
    reasons: ['the folder has no package.json; run chex init from the repo root'],
  });
});

test('it plans only the guard for a repo that extends the baseline and lacks it', () => {
  const packageText = JSON.stringify({
    name: 'kettle',
    scripts: { 'check:docs': 'chex length links' },
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  expect(
    buildInitPlan(packageText, 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n'),
  ).toStrictEqual({
    kind: 'apply',
    writes: [
      {
        file: 'lefthook.yml',
        text: `extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n${buildInitGuardHooks()}`,
      },
    ],
    notes: [
      'lefthook.yml runs chex-baseline first in pre-commit and pre-push, which fails when node_modules/@zgeoff/chex/lefthook.yml is missing',
    ],
  });
});

test('it refuses both edits when lefthook.yml writes a hook in a form the guard edit does not take', () => {
  const packageText = JSON.stringify({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  expect(buildInitPlan(packageText, 'pre-commit:\n  jobs: []\n')).toStrictEqual({
    kind: 'refused',
    reasons: [
      'lefthook.yml writes pre-commit in a form chex init does not edit; write its pre-commit jobs as a block list, then run chex init again',
    ],
  });
});
