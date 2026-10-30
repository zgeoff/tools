import { expect, test } from 'bun:test';
import { buildTestSelection } from './build-test-selection.ts';
import { defineRig } from './define-rig.ts';

test('it keeps the lane selection and the flags when no argument is a path', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'host', suffix: '.host' },
    repoRoot: '/repo',
    trackedFiles: ['pkg/src/oven.host.test.ts'],
    args: { flags: ['--seed=1', '--bail'], paths: [] },
  });

  expect(selection).toStrictEqual({ kind: 'lane', flags: ['--seed=1', '--bail'] });
});

test('it selects nothing for a host run given the path of a unit test file', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'host', suffix: '.host' },
    repoRoot: '/repo',
    trackedFiles: ['pkg/src/oven.test.ts', 'pkg/src/oven.host.test.ts'],
    args: { flags: [], paths: ['./pkg/src/oven.test.ts'] },
  });

  expect(selection).toStrictEqual({ kind: 'none' });
});

test('it selects nothing for a unit run given the path of a host test file', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'unit', suffix: null },
    repoRoot: '/repo',
    trackedFiles: ['pkg/src/oven.test.ts', 'pkg/src/oven.host.test.ts'],
    args: { flags: ['--bail'], paths: ['./pkg/src/oven.host.test.ts'] },
  });

  expect(selection).toStrictEqual({ kind: 'none' });
});

test('it selects the one lane file that a file path names, and keeps the flags', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'unit', suffix: null },
    repoRoot: '/repo',
    trackedFiles: ['pkg/src/oven.test.ts', 'pkg/src/big-oven.test.ts'],
    args: { flags: ['--bail'], paths: ['./pkg/src/oven.test.ts'] },
  });

  expect(selection).toStrictEqual({
    kind: 'files',
    files: ['./pkg/src/oven.test.ts'],
    flags: ['--bail'],
  });
});

test('it selects the lane files under a folder path and none of the other lanes', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'kiln', suffix: '.kiln' },
    repoRoot: '/repo',
    trackedFiles: [
      'pkg/src/fire.kiln.test.ts',
      'pkg/src/glaze/coat.kiln.test.ts',
      'pkg/src/fire.test.ts',
      'pkg/src/fire.host.test.ts',
      'other/src/clay.kiln.test.ts',
    ],
    args: { flags: [], paths: ['pkg/src/'] },
  });

  expect(selection).toStrictEqual({
    kind: 'files',
    files: ['./pkg/src/fire.kiln.test.ts', './pkg/src/glaze/coat.kiln.test.ts'],
    flags: [],
  });
});

test('it reads an absolute path against the repo root', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'host', suffix: '.host' },
    repoRoot: '/repo',
    trackedFiles: ['pkg/src/oven.host.test.ts', 'other/src/door.host.test.ts'],
    args: { flags: [], paths: ['/repo/pkg'] },
  });

  expect(selection).toStrictEqual({
    kind: 'files',
    files: ['./pkg/src/oven.host.test.ts'],
    flags: [],
  });
});

test('it selects the lane files whose path holds a bare word, as bun test filters', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'unit', suffix: null },
    repoRoot: '/repo',
    trackedFiles: ['pkg/src/oven.test.ts', 'pkg/src/oven.host.test.ts', 'pkg/src/door.test.ts'],
    args: { flags: [], paths: ['oven'] },
  });

  expect(selection).toStrictEqual({
    kind: 'files',
    files: ['./pkg/src/oven.test.ts'],
    flags: [],
  });
});

test('it selects nothing for a ./ path that names no tracked file or folder', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'unit', suffix: null },
    repoRoot: '/repo',
    trackedFiles: ['pkg/src/oven.test.ts'],
    args: { flags: [], paths: ['./oven'] },
  });

  expect(selection).toStrictEqual({ kind: 'none' });
});

test('it gives the e2e lane the test files under its folders and leaves out a suffixed lane file', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'e2e', suffix: null },
    repoRoot: '/repo',
    trackedFiles: [
      'e2e/bake.test.ts',
      'e2e/page.browser.test.ts',
      'pkg/src/oven.test.ts',
      'e2e/fixture.ts',
    ],
    args: { flags: [], paths: ['.'] },
  });

  expect(selection).toStrictEqual({ kind: 'files', files: ['./e2e/bake.test.ts'], flags: [] });
});

test('it gives the unit lane every test file outside the e2e folders and the suffixed lanes', () => {
  const selection = buildTestSelection({
    config: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    lane: { name: 'unit', suffix: null },
    repoRoot: '/repo',
    trackedFiles: [
      'e2e/bake.test.ts',
      'pkg/src/oven.kiln.test.ts',
      'pkg/src/oven.test.ts',
      'pkg/src/view.test.tsx',
      'pkg/src/oven.ts',
    ],
    args: { flags: [], paths: ['./'] },
  });

  expect(selection).toStrictEqual({
    kind: 'files',
    files: ['./pkg/src/oven.test.ts', './pkg/src/view.test.tsx'],
    flags: [],
  });
});
