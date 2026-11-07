import { expect, test } from 'bun:test';
import { hasLaneSuffix } from './has-lane-suffix.ts';

test.each([
  ['src/fire.kiln.test.ts', true],
  ['src/fire.kiln.test.tsx', true],
  ['src/fire.test.ts', false],
  ['src/fire.kiln.ts', false],
])('it finds %s in the .kiln lane: %p', (file, isInLane) => {
  expect(hasLaneSuffix(file, '.kiln')).toBe(isInLane);
});
