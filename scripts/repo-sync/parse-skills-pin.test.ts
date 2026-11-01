import { expect, test } from 'bun:test';
import { parseSkillsPin } from './parse-skills-pin.ts';

test('it reads the commit of a pin', () => {
  expect(parseSkillsPin({ commit: '0123456789abcdef0123456789abcdef01234567' })).toBe(
    '0123456789abcdef0123456789abcdef01234567',
  );
});

test.each([
  ['a list in place of an object', ['0123456789abcdef0123456789abcdef01234567']],
  ['a pin with no commit', {}],
  ['a short commit ID', { commit: '0123456' }],
  ['a branch name', { commit: 'main' }],
  ['an uppercase commit ID', { commit: '0123456789ABCDEF0123456789ABCDEF01234567' }],
])('it refuses %s', (_label, value) => {
  expect(parseSkillsPin(value)).toBeNull();
});
