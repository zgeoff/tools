import { expect, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { pickLaneSelection } from './pick-lane-selection.ts';

test('it selects the files that carry the suffix of a suffix lane', () => {
  const lane = defineRig({}).lanes.find((candidate) => candidate.name === 'host');

  expect(lane && pickLaneSelection(lane, ['e2e'])).toStrictEqual([
    '.host.test.ts',
    '.host.test.tsx',
  ]);
});

test('it selects the e2e folders as paths', () => {
  const lane = defineRig({}).lanes.find((candidate) => candidate.name === 'e2e');

  expect(lane && pickLaneSelection(lane, ['e2e', 'apps/shop/e2e'])).toStrictEqual([
    './e2e/',
    './apps/shop/e2e/',
  ]);
});

test('it selects nothing for the e2e lane of a repo with no e2e folder', () => {
  const lane = defineRig({}).lanes.find((candidate) => candidate.name === 'e2e');

  expect(lane && pickLaneSelection(lane, [])).toBeEmpty();
});
