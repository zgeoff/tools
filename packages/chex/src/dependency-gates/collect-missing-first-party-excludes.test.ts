import { expect, test } from 'bun:test';
import { collectMissingFirstPartyExcludes } from './collect-missing-first-party-excludes.ts';

test('it reports each first-party package with no exclude', () => {
  const findings = collectMissingFirstPartyExcludes({ isOn: true, excludes: ['@zgeoff/std'] }, [
    '@impz/client',
    '@wringer/core',
    '@zgeoff/std',
    'left-pad',
  ]);

  expect(findings).toStrictEqual([
    {
      path: 'bunfig.toml',
      entry: '@impz/client',
      problem:
        'the first-party package has no age-gate exclude, so bun install refuses each release younger than the gate',
    },
    {
      path: 'bunfig.toml',
      entry: '@wringer/core',
      problem:
        'the first-party package has no age-gate exclude, so bun install refuses each release younger than the gate',
    },
  ]);
});

test('it reports a first-party package whose exclude names one version', () => {
  const findings = collectMissingFirstPartyExcludes(
    { isOn: true, excludes: ['@zgeoff/std@0.4.0'] },
    ['@zgeoff/std'],
  );

  expect(findings).toStrictEqual([
    {
      path: 'bunfig.toml',
      entry: '@zgeoff/std',
      problem:
        'the first-party package has no age-gate exclude, so bun install refuses each release younger than the gate',
    },
  ]);
});

test('it reports nothing when the repo sets no age gate', () => {
  expect(
    collectMissingFirstPartyExcludes({ isOn: false, excludes: [] }, ['@zgeoff/std']),
  ).toStrictEqual([]);
});
