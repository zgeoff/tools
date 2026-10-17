import { expect, test } from 'bun:test';
import { buildBunfigWithoutExpiredExcludes } from './build-bunfig-without-expired-excludes.ts';

const honoComment =
  '# hono 4.13.0 (published 2026-10-08, patches GHSA-8j4g-w8fx-2239) ages past the gate ~2026-10-15 — remove then (audit-fix)\n';

test('it drops an audit-fix exclude whose release has aged past the gate', () => {
  const bunfig = `minimumReleaseAge = 604800\n# qs is a person's exclude\n${honoComment}minimumReleaseAgeExcludes = [\n  "qs",\n  "hono",\n]\n`;
  const result = buildBunfigWithoutExpiredExcludes(bunfig, '2026-10-17');

  expect(result).toStrictEqual({
    bunfig: `minimumReleaseAge = 604800\n# qs is a person's exclude\nminimumReleaseAgeExcludes = [\n  "qs",\n]\n`,
    removed: ['hono'],
  });

  expect(Bun.TOML.parse(result.bunfig)).toStrictEqual({
    minimumReleaseAge: 604_800,
    minimumReleaseAgeExcludes: ['qs'],
  });
});

test('it drops an aged exclude from a list on one line', () => {
  const bunfig = `minimumReleaseAge = 604800\n${honoComment}minimumReleaseAgeExcludes = ["qs", "hono"]\n`;

  expect(buildBunfigWithoutExpiredExcludes(bunfig, '2026-10-15').bunfig).toBe(
    'minimumReleaseAge = 604800\nminimumReleaseAgeExcludes = ["qs"]\n',
  );
});

test('it keeps an audit-fix exclude whose release is still younger than the gate', () => {
  const bunfig = `minimumReleaseAge = 604800\n${honoComment}minimumReleaseAgeExcludes = ["hono"]\n`;

  expect(buildBunfigWithoutExpiredExcludes(bunfig, '2026-10-14')).toStrictEqual({
    bunfig,
    removed: [],
  });
});

test('it keeps an exclude with no audit-fix comment', () => {
  const bunfig =
    'minimumReleaseAge = 604800\n# hono 4.13.0 ages past the gate ~2026-08-10 — remove then (#837)\nminimumReleaseAgeExcludes = ["hono"]\n';

  expect(buildBunfigWithoutExpiredExcludes(bunfig, '2026-10-17').removed).toBeEmpty();
});
