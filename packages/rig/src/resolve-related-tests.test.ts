import { expect, mock, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { resolveRelatedTests } from './resolve-related-tests.ts';

test('it selects a test file that the probe finds', () => {
  const probeFile = mock(() => true);

  expect(
    resolveRelatedTests(['src/a.test.ts'], defineRig({}), { cwd: '/repo', probeFile }),
  ).toStrictEqual(['src/a.test.ts']);

  expect(probeFile).toHaveBeenCalledExactlyOnceWith('/repo/src/a.test.ts');
});

test('it selects the sibling test of a source file', () => {
  const probeFile = mock(() => true);

  expect(
    resolveRelatedTests(['src/a.ts'], defineRig({}), { cwd: '/repo', probeFile }),
  ).toStrictEqual(['src/a.test.ts']);

  expect(probeFile).toHaveBeenCalledExactlyOnceWith('/repo/src/a.test.ts');
});

test('it selects the sibling test of a TSX component', () => {
  const probeFile = mock(() => true);

  expect(
    resolveRelatedTests(['src/view.tsx'], defineRig({}), { cwd: '/repo', probeFile }),
  ).toStrictEqual(['src/view.test.tsx']);

  expect(probeFile).toHaveBeenCalledExactlyOnceWith('/repo/src/view.test.tsx');
});

test('it skips a source file with no sibling test and a deleted test file', () => {
  const sources = { cwd: '/repo', probeFile: () => false };

  expect(resolveRelatedTests(['src/a.ts', 'src/gone.test.ts'], defineRig({}), sources)).toBeEmpty();
});

test('it skips a declaration file even when a test sits beside it', () => {
  const sources = { cwd: '/repo', probeFile: () => true };

  expect(resolveRelatedTests(['src/types.d.ts'], defineRig({}), sources)).toBeEmpty();
});

test('it skips files that are not TypeScript', () => {
  const sources = { cwd: '/repo', probeFile: () => true };

  expect(resolveRelatedTests(['src/a.md', 'README.md'], defineRig({}), sources)).toBeEmpty();
});

test('it keeps the order of the paths and drops duplicates', () => {
  const probeFile = mock(() => true);

  expect(
    resolveRelatedTests(['src/b.ts', 'src/a.test.ts', 'src/b.test.ts'], defineRig({}), {
      cwd: '/repo',
      probeFile,
    }),
  ).toStrictEqual(['src/b.test.ts', 'src/a.test.ts']);

  expect(probeFile).toHaveBeenCalledTimes(3);
});

test.each([
  ['e2e/checkout.test.ts'],
  ['packages/shop/e2e/checkout.test.ts'],
  ['e2e/helpers.ts'],
  ['src/view.browser.test.tsx'],
  ['src/store.docker.test.ts'],
  ['src/clock.host.test.ts'],
  ['src/session.agent-sdk.test.ts'],
  ['src/summary.model-api.test.ts'],
  ['packages/shop-e2e/checkout.test.ts'],
])('it leaves out the lane file %s', (path) => {
  const sources = { cwd: '/repo', probeFile: () => true };

  expect(resolveRelatedTests([path], defineRig({}), sources)).toBeEmpty();
});

test('it leaves out a file of a lane that the config declares', () => {
  const config = defineRig({ lanes: { radar: { limit: '30s' } } });

  expect(
    resolveRelatedTests(['src/sweep.radar.test.ts'], config, {
      cwd: '/repo',
      probeFile: () => true,
    }),
  ).toBeEmpty();
});

test('it leaves out a file of a lane whose suffix the config sets', () => {
  const config = defineRig({ lanes: { radar: { limit: '30s', suffix: '.sweep' } } });

  expect(
    resolveRelatedTests(['src/boot.sweep.ts'], config, { cwd: '/repo', probeFile: () => true }),
  ).toBeEmpty();
});

test('it selects a test whose suffix no lane declares', () => {
  const sources = { cwd: '/repo', probeFile: () => true };

  expect(resolveRelatedTests(['src/sweep.radar.test.ts'], defineRig({}), sources)).toStrictEqual([
    'src/sweep.radar.test.ts',
  ]);
});
