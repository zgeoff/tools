import { expect, test } from 'bun:test';
import { findFirstPartyScopeDrift } from './find-first-party-scope-drift.ts';

test('it finds no drift when the first-party rule matches each scope and nothing else', () => {
  const preset = JSON.stringify({
    packageRules: [
      { matchPackageNames: ['left-pad'] },
      { matchPackageNames: ['@acme/**', '@initech/**'], minimumReleaseAge: null },
    ],
  });

  expect(findFirstPartyScopeDrift(preset, ['@initech/', '@acme/'])).toBeUndefined();
});

test('it reports a scope that the first-party rule matches and the check lacks', () => {
  const preset = JSON.stringify({
    packageRules: [{ matchPackageNames: ['@acme/**', '@initech/**'], minimumReleaseAge: null }],
  });

  expect(findFirstPartyScopeDrift(preset, ['@acme/'])).toBe(
    'default.json: the rules that lift the release-age wait match @acme/**, @initech/**, but the dependency-gates check treats @acme/** as first party',
  );
});

test('it reports a scope that the check holds and the first-party rule lacks', () => {
  const preset = JSON.stringify({
    packageRules: [{ matchPackageNames: ['@acme/**'], minimumReleaseAge: null }],
  });

  expect(findFirstPartyScopeDrift(preset, ['@acme/', '@initech/'])).toBe(
    'default.json: the rules that lift the release-age wait match @acme/**, but the dependency-gates check treats @acme/**, @initech/** as first party',
  );
});

test('it skips an earlier rule that names a first-party scope for another purpose', () => {
  const preset = JSON.stringify({
    packageRules: [
      { matchPackageNames: ['@acme/**'], groupName: 'acme packages' },
      { matchPackageNames: ['@acme/**', '@initech/**'], minimumReleaseAge: null },
    ],
  });

  expect(findFirstPartyScopeDrift(preset, ['@acme/', '@initech/'])).toBeUndefined();
});

test('it skips a rule that lifts the release-age wait for a single package or a dependency name', () => {
  const preset = JSON.stringify({
    packageRules: [
      { matchPackageNames: ['@acme/**'], minimumReleaseAge: null },
      { matchPackageNames: ['left-pad'], minimumReleaseAge: null },
      { matchDepNames: ['acme/tools'], minimumReleaseAge: null },
    ],
  });

  expect(findFirstPartyScopeDrift(preset, ['@acme/'])).toBeUndefined();
});

test('it reports a preset with no rule that lifts the release-age wait for a scope', () => {
  const preset = JSON.stringify({
    packageRules: [{ matchPackageNames: ['@acme/**'], groupName: 'acme packages' }],
  });

  expect(findFirstPartyScopeDrift(preset, ['@acme/'])).toBe(
    'default.json: no package rule lifts the release-age wait for a scope (@acme/**)',
  );
});

test('it reports a preset that is not JSON', () => {
  expect(findFirstPartyScopeDrift('{ "packageRules": [', ['@acme/'])).toBe(
    'default.json is not valid JSON',
  );
});
