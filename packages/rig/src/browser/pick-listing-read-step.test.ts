import { expect, test } from 'bun:test';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { pickListingReadStep } from './pick-listing-read-step.ts';

test('it picks listed with the listing that the read returned, even past the deadline', () => {
  const step = pickListingReadStep([buildProcessEntry(4100, 4000)], true);

  expect(step).toStrictEqual({ kind: 'listed', listing: [buildProcessEntry(4100, 4000)] });
});

test('it picks retry for a failed read before the deadline', () => {
  expect(pickListingReadStep(null, false)).toStrictEqual({ kind: 'retry' });
});

test('it picks failed for a failed read at the deadline', () => {
  expect(pickListingReadStep(null, true)).toStrictEqual({ kind: 'failed' });
});
