import { expect, test } from 'bun:test';
import { collectUnversionedPackages } from './collect-unversioned-packages.ts';

test('it returns each released package that the manifest gives no version', () => {
  const unversioned = collectUnversionedPackages(
    {
      packages: {
        'packages/ledger': { component: '@acme/ledger' },
        'packages/sampler': { component: '@acme/sampler', 'initial-version': '0.1.0' },
      },
    },
    { 'packages/ledger': '1.4.0' },
  );

  expect(unversioned).toStrictEqual(['packages/sampler']);
});

test('it returns nothing when the manifest versions every released package', () => {
  const unversioned = collectUnversionedPackages(
    { packages: { 'packages/ledger': { component: '@acme/ledger' } } },
    { 'packages/ledger': '1.4.0', 'packages/retired': '0.2.0' },
  );

  expect(unversioned).toStrictEqual([]);
});

test('it treats a manifest that is not an object as one that versions nothing', () => {
  const unversioned = collectUnversionedPackages(
    { packages: { 'packages/ledger': { component: '@acme/ledger' } } },
    ['packages/ledger'],
  );

  expect(unversioned).toStrictEqual(['packages/ledger']);
});

test('it gives every released package in this repo a manifest version', async () => {
  const repoRoot = new URL('../../', import.meta.url);

  const config: unknown = await Bun.file(new URL('release-please-config.json', repoRoot)).json();

  const manifest: unknown = await Bun.file(
    new URL('.release-please-manifest.json', repoRoot),
  ).json();

  expect(collectUnversionedPackages(config, manifest)).toStrictEqual([]);
});
