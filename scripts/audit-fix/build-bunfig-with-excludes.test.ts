import { expect, test } from 'bun:test';
import { buildBunfigWithExcludes } from './build-bunfig-with-excludes.ts';

const honoExclude = {
  name: 'hono',
  version: '4.13.0',
  publishedOn: '2026-10-15',
  agesPastGateOn: '2026-10-22',
  advisories: ['GHSA-8j4g-w8fx-2239'],
};

test('it adds the list under the gate when bunfig.toml has none', () => {
  const bunfig = '[install]\nminimumReleaseAge = 604800\n\n[test]\npreload = []\n';

  expect(buildBunfigWithExcludes(bunfig, [honoExclude])).toBe(
    '[install]\nminimumReleaseAge = 604800\n\n# hono 4.13.0 (published 2026-10-15, patches GHSA-8j4g-w8fx-2239) ages past the gate ~2026-10-22 — remove then (audit-fix)\nminimumReleaseAgeExcludes = [\n  "hono",\n]\n\n[test]\npreload = []\n',
  );
});

test('it appends to a list on several lines and keeps its comments', () => {
  const bunfig =
    'minimumReleaseAge = 604800\n# qs patches an advisory\nminimumReleaseAgeExcludes = [\n  "qs",\n]\n';

  expect(buildBunfigWithExcludes(bunfig, [honoExclude])).toBe(
    'minimumReleaseAge = 604800\n# qs patches an advisory\n# hono 4.13.0 (published 2026-10-15, patches GHSA-8j4g-w8fx-2239) ages past the gate ~2026-10-22 — remove then (audit-fix)\nminimumReleaseAgeExcludes = [\n  "qs",\n  "hono",\n]\n',
  );
});

test('it appends to a list on one line', () => {
  const bunfig = 'minimumReleaseAge = 604800\nminimumReleaseAgeExcludes = ["qs"]\n';

  expect(buildBunfigWithExcludes(bunfig, [honoExclude])).toBe(
    'minimumReleaseAge = 604800\n# hono 4.13.0 (published 2026-10-15, patches GHSA-8j4g-w8fx-2239) ages past the gate ~2026-10-22 — remove then (audit-fix)\nminimumReleaseAgeExcludes = ["qs", "hono"]\n',
  );
});

test('it leaves bunfig.toml unchanged when the list already holds the package', () => {
  const bunfig = 'minimumReleaseAge = 604800\nminimumReleaseAgeExcludes = ["hono"]\n';

  expect(buildBunfigWithExcludes(bunfig, [honoExclude])).toBe(bunfig);
});

test('it rejects a bunfig.toml with no release-age gate', () => {
  expect(() => buildBunfigWithExcludes('[install]\nexact = true\n', [honoExclude])).toThrow(
    'bunfig.toml sets no minimumReleaseAge, so no release needs an exclude',
  );
});

test('it puts the comma before a comment on the last entry', () => {
  const bunfig =
    'minimumReleaseAge = 604800\nminimumReleaseAgeExcludes = [\n  "qs" # patches an advisory\n]\n';

  const result = buildBunfigWithExcludes(bunfig, [honoExclude]);

  expect(result).toBe(
    'minimumReleaseAge = 604800\n# hono 4.13.0 (published 2026-10-15, patches GHSA-8j4g-w8fx-2239) ages past the gate ~2026-10-22 — remove then (audit-fix)\nminimumReleaseAgeExcludes = [\n  "qs", # patches an advisory\n  "hono",\n]\n',
  );

  expect(Bun.TOML.parse(result)).toStrictEqual({
    minimumReleaseAge: 604_800,
    minimumReleaseAgeExcludes: ['qs', 'hono'],
  });
});

test('it fills an empty list on one line', () => {
  const bunfig = 'minimumReleaseAge = 604800\nminimumReleaseAgeExcludes = []\n';

  expect(buildBunfigWithExcludes(bunfig, [honoExclude])).toBe(
    'minimumReleaseAge = 604800\n# hono 4.13.0 (published 2026-10-15, patches GHSA-8j4g-w8fx-2239) ages past the gate ~2026-10-22 — remove then (audit-fix)\nminimumReleaseAgeExcludes = ["hono"]\n',
  );
});
