import { expect, test } from 'bun:test';
import { collectUnprogrammedE2EDirs } from './collect-unprogrammed-e2e-dirs.ts';

function setupTest() {
  const kettle = {
    package: 'packages/kettle',
    source: 'src/cli.ts',
    build: 'true',
    artifact: 'dist/cli.js',
  };

  return { kettle };
}

test('it passes an e2e folder whose package a program names', () => {
  const ctx = setupTest();

  expect(collectUnprogrammedE2EDirs(['packages/kettle/e2e'], { kettle: ctx.kettle })).toBeEmpty();
});

test('it reports an e2e folder whose package no program names', () => {
  const ctx = setupTest();

  expect(
    collectUnprogrammedE2EDirs(['packages/kettle/e2e', 'packages/teapot/e2e'], {
      kettle: ctx.kettle,
    }),
  ).toStrictEqual(['packages/teapot/e2e']);
});

test('it matches a root e2e folder to a program of the root package', () => {
  const ctx = setupTest();

  expect(
    collectUnprogrammedE2EDirs(['e2e'], { kettle: { ...ctx.kettle, package: '.' } }),
  ).toBeEmpty();
});
