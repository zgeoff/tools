import { expect, test } from 'bun:test';
import { buildInitPlan } from './build-init-plan.ts';

function setupTest() {
  const baselinePackage = {
    name: 'kettle',
    scripts: { test: 'bun test' },
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  };

  return { baselinePackage, packageText: JSON.stringify(baselinePackage) };
}

test('it plans the extends line and the check:docs script for a repo that has neither', () => {
  const ctx = setupTest();

  const edited = {
    ...ctx.baselinePackage,
    scripts: { test: 'bun test', 'check:docs': 'chex prose length links' },
  };

  expect(buildInitPlan(ctx.packageText, undefined)).toStrictEqual({
    kind: 'apply',
    writes: [
      { file: 'lefthook.yml', text: 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n' },
      { file: 'package.json', text: `${JSON.stringify(edited, null, 2)}\n` },
    ],
    notes: [
      'lefthook.yml extends node_modules/@zgeoff/chex/lefthook.yml',
      'package.json runs "chex prose length links" as check:docs',
    ],
  });
});

test('it plans no write for a repo that already takes the baseline, and keeps its check:docs', () => {
  const ctx = setupTest();

  const packageText = JSON.stringify({
    ...ctx.baselinePackage,
    scripts: { 'check:docs': 'chex length links vision' },
  });

  expect(
    buildInitPlan(packageText, 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n'),
  ).toStrictEqual({
    kind: 'apply',
    writes: [],
    notes: ['the repo already takes the baseline; nothing to change'],
  });
});

test('it refuses a repo that does not install rig and diet', () => {
  expect(
    buildInitPlan(JSON.stringify({ devDependencies: { '@zgeoff/chex': '0.1.0' } }), undefined),
  ).toStrictEqual({
    kind: 'refused',
    reasons: [
      'the baseline needs @zgeoff/rig, @zgeoff/diet installed; run bun add -d @zgeoff/rig @zgeoff/diet',
    ],
  });
});

test('it refuses both edits when lefthook.yml lists extends inline', () => {
  const ctx = setupTest();

  expect(buildInitPlan(ctx.packageText, 'extends: [local.yml]\n')).toStrictEqual({
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
