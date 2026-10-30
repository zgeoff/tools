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
    packageRules: [{ matchPackageNames: ['@acme/**', '@initech/**'] }],
  });

  expect(findFirstPartyScopeDrift(preset, ['@acme/'])).toBe(
    'default.json: the first-party rule matches @acme/**, @initech/**, but the dependency-gates check treats @acme/** as first party',
  );
});

test('it reports a scope that the check holds and the first-party rule lacks', () => {
  const preset = JSON.stringify({ packageRules: [{ matchPackageNames: ['@acme/**'] }] });

  expect(findFirstPartyScopeDrift(preset, ['@acme/', '@initech/'])).toBe(
    'default.json: the first-party rule matches @acme/**, but the dependency-gates check treats @acme/**, @initech/** as first party',
  );
});

test('it reports a preset with no rule that matches a first-party scope', () => {
  const preset = JSON.stringify({ packageRules: [{ matchPackageNames: ['left-pad'] }] });

  expect(findFirstPartyScopeDrift(preset, ['@acme/'])).toBe(
    'default.json: no package rule matches a first-party scope (@acme/**)',
  );
});

test('it reports a preset that is not JSON', () => {
  expect(findFirstPartyScopeDrift('{ "packageRules": [', ['@acme/'])).toBe(
    'default.json is not valid JSON',
  );
});
