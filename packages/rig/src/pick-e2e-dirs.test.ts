import { expect, test } from 'bun:test';
import { pickE2EDirs } from './pick-e2e-dirs.ts';

test('it picks the e2e folder at the repo root', () => {
  expect(pickE2EDirs(['e2e/login.test.ts', 'src/a.ts'])).toStrictEqual(['e2e']);
});

test('it picks the e2e folder of an app root and leaves out one in a folder with no package.json', () => {
  const files = [
    'apps/shop/package.json',
    'apps/shop/e2e/checkout.test.ts',
    'apps/shop/src/legacy/e2e/checkout.test.ts',
  ];

  expect(pickE2EDirs(files)).toStrictEqual(['apps/shop/e2e']);
});

test('it picks a package whose folder name ends in -e2e', () => {
  const files = ['packages/shop-e2e/package.json', 'packages/shop-e2e/checkout.test.ts'];

  expect(pickE2EDirs(files)).toStrictEqual(['packages/shop-e2e']);
});

test('it leaves out a -e2e folder that holds no package.json', () => {
  expect(pickE2EDirs(['docs/notes-e2e/checkout.test.ts'])).toBeEmpty();
});

test('it lists each folder once, in order', () => {
  const files = [
    'e2e/b.test.ts',
    'e2e/a.test.ts',
    'apps/shop/package.json',
    'apps/shop/e2e/c.test.ts',
  ];

  expect(pickE2EDirs(files)).toStrictEqual(['apps/shop/e2e', 'e2e']);
});
