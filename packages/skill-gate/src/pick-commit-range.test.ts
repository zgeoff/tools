import { expect, test } from 'bun:test';
import { pickCommitRange } from './pick-commit-range.ts';

test('it picks the range when the command moved HEAD', () => {
  expect(pickCommitRange('c0ffee', 'beef42')).toStrictEqual({ from: 'c0ffee', to: 'beef42' });
});

test('it picks a range from no commit when the command made the first commit', () => {
  expect(pickCommitRange(null, 'beef42')).toStrictEqual({ from: null, to: 'beef42' });
});

test('it picks no range when HEAD stayed', () => {
  expect(pickCommitRange('c0ffee', 'c0ffee')).toBeNull();
});

test('it picks no range when there is still no commit', () => {
  expect(pickCommitRange(null, null)).toBeNull();
});
