import { expect, test } from 'bun:test';
import { parseAgeGate } from './parse-age-gate.ts';

test('it reads the gate and its excludes', () => {
  const bunfig = [
    '[install]',
    'minimumReleaseAge = 604800',
    'minimumReleaseAgeExcludes = ["@zgeoff/std", "left-pad@1.3.1"]',
  ].join('\n');

  expect(parseAgeGate(bunfig)).toStrictEqual({
    isOn: true,
    excludes: ['@zgeoff/std', 'left-pad@1.3.1'],
  });
});

test('it reads a gate written with a unit', () => {
  expect(parseAgeGate(['[install]', 'minimumReleaseAge = "3d"'].join('\n'))).toStrictEqual({
    isOn: true,
    excludes: [],
  });
});

test('it reads a gate of 0 as off', () => {
  expect(parseAgeGate(['[install]', 'minimumReleaseAge = 0'].join('\n'))).toStrictEqual({
    isOn: false,
    excludes: [],
  });
});

test('it reads a bunfig with no install section as no gate', () => {
  expect(parseAgeGate('')).toStrictEqual({ isOn: false, excludes: [] });
});

test('it fails an exclude list that is not a list of names', () => {
  expect(() =>
    parseAgeGate(['[install]', 'minimumReleaseAgeExcludes = "left-pad"'].join('\n')),
  ).toThrow('bunfig.toml sets a minimumReleaseAgeExcludes that is not a list of names');
});
