import { expect, test } from 'bun:test';
import { collectUnneededOverrides } from './collect-unneeded-overrides.ts';

test('it reports an override that every dependent range already admits', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: {},
      catalogs: {},
      dependents: [
        { dependent: 'pad-tools@2.0.0', name: 'left-pad', range: '^1.3.0' },
        { dependent: 'text-kit@4.1.0', name: 'left-pad', range: '>=1.0.0' },
      ],
    }),
  ).toStrictEqual([
    {
      path: 'package.json',
      entry: 'left-pad',
      problem: 'every range in bun.lock already admits 1.3.1, so the override changes nothing',
    },
  ]);
});

test('it keeps an override that a dependent range excludes', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: {},
      catalogs: {},
      dependents: [
        { dependent: 'pad-tools@2.0.0', name: 'left-pad', range: '^1.3.0' },
        { dependent: 'text-kit@4.1.0', name: 'left-pad', range: '1.2.0' },
      ],
    }),
  ).toStrictEqual([]);
});

test('it keeps an override that pins the catalog version for its dependents', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: { 'left-pad': '1.3.1' },
      catalogs: {},
      dependents: [{ dependent: 'pad-tools@2.0.0', name: 'left-pad', range: '^1.3.0' }],
    }),
  ).toStrictEqual([]);
});

test('it reports an override that differs from the catalog version and changes nothing', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: { 'left-pad': '1.3.0' },
      catalogs: {},
      dependents: [{ dependent: 'pad-tools@2.0.0', name: 'left-pad', range: '^1.3.0' }],
    }),
  ).toStrictEqual([
    {
      path: 'package.json',
      entry: 'left-pad',
      problem: 'every range in bun.lock already admits 1.3.1, so the override changes nothing',
    },
  ]);
});

test('it reports an override of a package that nothing depends on', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: {},
      catalogs: {},
      dependents: [{ dependent: 'pad-tools@2.0.0', name: 'right-pad', range: '^1.3.0' }],
    }),
  ).toStrictEqual([
    {
      path: 'package.json',
      entry: 'left-pad',
      problem: 'no package in bun.lock depends on the overridden package',
    },
  ]);
});

test('it reports an override that a catalog reference admits through the catalog range', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: { 'left-pad': '^1.3.0' },
      catalogs: {},
      dependents: [{ dependent: 'packages/spout', name: 'left-pad', range: 'catalog:' }],
    }),
  ).toStrictEqual([
    {
      path: 'package.json',
      entry: 'left-pad',
      problem: 'every range in bun.lock already admits 1.3.1, so the override changes nothing',
    },
  ]);
});

test('it keeps an override that a named catalog reference excludes', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: {},
      catalogs: { legacy: { 'left-pad': '^1.2.0 <1.3.0' } },
      dependents: [{ dependent: 'packages/spout', name: 'left-pad', range: 'catalog:legacy' }],
    }),
  ).toStrictEqual([]);
});

test('it keeps an override whose catalog reference names no catalog entry', () => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: {},
      catalogs: {},
      dependents: [{ dependent: 'packages/spout', name: 'left-pad', range: 'catalog:legacy' }],
    }),
  ).toStrictEqual([]);
});

test.each([
  ['a dist-tag', 'latest'],
  ['a workspace protocol', 'workspace:*'],
  ['an npm alias', 'npm:left-pad@^1.3.0'],
  ['a git URL', 'github:acme/left-pad'],
])('it keeps an override that a dependent declares with %s', (_label, range) => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: {},
      catalogs: {},
      dependents: [{ dependent: 'pad-tools@2.0.0', name: 'left-pad', range }],
    }),
  ).toStrictEqual([]);
});

test.each([
  ['a caret range', '^1.3.0'],
  ['a comparator pair', '>=1.0.0 <2.0.0'],
  ['an x-range', '1.x'],
  ['a hyphen range', '1.3.0 - 1.4.0'],
  ['an or-range', '^0.9.0 || ^1.3.0'],
  ['a wildcard', '*'],
])('it reports an override that %s admits', (_label, range) => {
  expect(
    collectUnneededOverrides({
      overrides: { 'left-pad': '1.3.1' },
      catalog: {},
      catalogs: {},
      dependents: [{ dependent: 'pad-tools@2.0.0', name: 'left-pad', range }],
    }),
  ).toStrictEqual([
    {
      path: 'package.json',
      entry: 'left-pad',
      problem: 'every range in bun.lock already admits 1.3.1, so the override changes nothing',
    },
  ]);
});
