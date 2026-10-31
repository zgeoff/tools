import { expect, test } from 'bun:test';
import { buildInitPackage } from './build-init-package.ts';

test('it counts a baseline package in dependencies as installed', () => {
  const outcome = buildInitPackage(
    JSON.stringify({
      dependencies: { '@zgeoff/rig': '0.0.2' },
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2' },
      scripts: { 'check:docs': 'chex length' },
    }),
  );

  expect(outcome).toStrictEqual({ kind: 'unchanged' });
});

test('it adds a scripts object to a package.json that has none', () => {
  const outcome = buildInitPackage(
    JSON.stringify({
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    }),
  );

  expect(outcome).toStrictEqual({
    kind: 'changed',
    text: `${JSON.stringify(
      {
        devDependencies: {
          '@zgeoff/chex': '0.1.0',
          '@zgeoff/diet': '0.1.2',
          '@zgeoff/rig': '0.0.2',
        },
        scripts: { 'check:docs': 'chex prose length links skill' },
      },
      null,
      2,
    )}\n`,
  });
});

test('it lists every baseline package the repo does not install', () => {
  expect(buildInitPackage('{}')).toStrictEqual({
    kind: 'missing',
    packages: ['@zgeoff/chex', '@zgeoff/rig', '@zgeoff/diet'],
  });
});

test('it refuses a package.json that is not JSON', () => {
  expect(buildInitPackage('{ "name": ')).toStrictEqual({
    kind: 'refused',
    reason: expect.stringMatching(/^package\.json is not JSON: /u),
  });
});

test('it refuses a package.json that is a JSON array', () => {
  expect(buildInitPackage('[]')).toStrictEqual({
    kind: 'refused',
    reason: 'package.json is not a JSON object',
  });
});

test('it refuses a package.json whose scripts are not a JSON object', () => {
  const text = JSON.stringify({
    name: 'kettle',
    scripts: [],
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  expect(buildInitPackage(text)).toStrictEqual({
    kind: 'refused',
    reason: 'the scripts of package.json are not a JSON object',
  });
});
