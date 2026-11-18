import { expect, test } from 'bun:test';
import { parseRigLaneLimits } from './parse-rig-lane-limits.ts';

test('it gives each lane of a resolved rig config its limit', () => {
  const parsed = parseRigLaneLimits({
    lanes: [
      { name: 'unit', suffix: null, limitMs: 5000 },
      { name: 'e2e', suffix: null, limitMs: 60_000 },
      { name: 'kiln', suffix: '.kiln', limitMs: 8000 },
    ],
  });

  expect(parsed).toStrictEqual({
    kind: 'parsed',
    limits: new Map([
      ['unit', 5000],
      ['e2e', 60_000],
      ['kiln', 8000],
    ]),
  });
});

test.each([
  ['null', null],
  ['an object with no lanes', {}],
  ['lanes that are no list', { lanes: { kiln: 8000 } }],
])('it refuses a default export that is %s', (_, rigConfig) => {
  expect(parseRigLaneLimits(rigConfig)).toStrictEqual({
    kind: 'refused',
    reason: 'its default export has no list of lanes',
  });
});

test('it refuses a lane with no limitMs', () => {
  expect(parseRigLaneLimits({ lanes: [{ name: 'kiln', limit: '8s' }] })).toStrictEqual({
    kind: 'refused',
    reason: 'lane 0 lacks a name or a limitMs',
  });
});
