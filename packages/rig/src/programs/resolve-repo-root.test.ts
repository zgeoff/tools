import { expect, test } from 'bun:test';
import { resolveRepoRoot } from './resolve-repo-root.ts';

test('it finds the nearest folder above the cwd that holds rig.config.ts', () => {
  const root = resolveRepoRoot(
    '/repo/packages/kettle/src',
    (path) => path === '/repo/rig.config.ts',
  );

  expect(root).toBe('/repo');
});

test('it takes the cwd itself when it holds rig.config.ts', () => {
  expect(resolveRepoRoot('/repo', (path) => path === '/repo/rig.config.ts')).toBe('/repo');
});

test('it throws when no folder above holds rig.config.ts', () => {
  expect(() => resolveRepoRoot('/repo/src', () => false)).toThrowWithMessage(
    Error,
    'no rig.config.ts sits in /repo/src or any folder above it',
  );
});
