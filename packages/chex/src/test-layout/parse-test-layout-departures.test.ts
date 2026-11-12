import { expect, test } from 'bun:test';
import { parseTestLayoutDepartures } from './parse-test-layout-departures.ts';

test.each([
  { label: 'no chex field', manifest: { name: 'kettle' }, folders: [] },
  { label: 'a chex field with no testLayout', manifest: { chex: {} }, folders: [] },
  {
    label: 'two departures',
    manifest: {
      chex: {
        testLayout: {
          departures: [
            { path: 'e2e/', reason: 'one lane spans the brewer and the pourer' },
            { path: 'tools/bench/', reason: 'the bench drives every package at once' },
          ],
        },
      },
    },
    folders: ['e2e', 'tools/bench'],
  },
])('it parses the folders of a manifest with $label', (row) => {
  expect(parseTestLayoutDepartures(row.manifest)).toStrictEqual({
    kind: 'parsed',
    folders: row.folders,
  });
});

test.each([
  { label: 'with no trailing slash', path: 'e2e' },
  { label: 'with a leading ./', path: './e2e/' },
  { label: 'that climbs out with ../', path: 'e2e/../bench/' },
  { label: 'that starts at /', path: '/e2e/' },
])('it refuses a departure path $label', (row) => {
  const departure = { path: row.path, reason: 'a shared lane' };
  const manifest = { chex: { testLayout: { departures: [departure] } } };

  expect(parseTestLayoutDepartures(manifest)).toStrictEqual({
    kind: 'refused',
    reason:
      'chex.testLayout.departures.0.path: give a folder relative to the repo root, ending in /, such as e2e/',
  });
});

test('it refuses a departure with a blank reason', () => {
  const manifest = { chex: { testLayout: { departures: [{ path: 'e2e/', reason: '  ' }] } } };

  expect(parseTestLayoutDepartures(manifest)).toStrictEqual({
    kind: 'refused',
    reason:
      'chex.testLayout.departures.0.reason: give the reason the repo keeps its tests in this folder',
  });
});

test('it refuses a misspelt key under chex', () => {
  expect(parseTestLayoutDepartures({ chex: { testlayout: { departures: [] } } })).toStrictEqual({
    kind: 'refused',
    reason: 'chex: Unrecognized key: "testlayout"',
  });
});
