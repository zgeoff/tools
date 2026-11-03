import { expect, test } from 'bun:test';
import { pickE2EDirs } from './pick-e2e-dirs.ts';

test('it picks the e2e folder at the root of a single-package repo', () => {
  expect(pickE2EDirs(['e2e/login.test.ts', 'src/a.ts'], false)).toStrictEqual(['e2e']);
});

test('it leaves out the e2e folder at the root of a workspace repo', () => {
  expect(pickE2EDirs(['e2e/login.test.ts', 'src/a.ts'], true)).toBeEmpty();
});

test('it picks the e2e folder of a package and leaves out one in a folder with no package.json', () => {
  const files = [
    'apps/shop/package.json',
    'apps/shop/e2e/checkout.test.ts',
    'apps/shop/src/legacy/e2e/checkout.test.ts',
  ];

  expect(pickE2EDirs(files, true)).toStrictEqual(['apps/shop/e2e']);
});

test('it leaves out a folder whose name ends in -e2e', () => {
  const files = ['packages/shop-e2e/package.json', 'packages/shop-e2e/checkout.test.ts'];

  expect(pickE2EDirs(files, true)).toBeEmpty();
});

test('it lists each folder once, in order', () => {
  const files = [
    'e2e/b.test.ts',
    'e2e/a.test.ts',
    'apps/shop/package.json',
    'apps/shop/e2e/c.test.ts',
  ];

  expect(pickE2EDirs(files, false)).toStrictEqual(['apps/shop/e2e', 'e2e']);
});
