import { expect, test } from 'bun:test';
import { getRigE2EBin } from './get-rig-e2e-bin.ts';

test('it returns the bin path that the e2e lane sets', () => {
  const binPath = getRigE2EBin({ RIG_E2E_BIN: '/work/notes/package/src/cli.ts' });

  expect(binPath).toBe('/work/notes/package/src/cli.ts');
});

test.each([
  ['unset', {}],
  ['empty', { RIG_E2E_BIN: '' }],
])('it fails, naming the lane script, when the variable is %s', (_, environment) => {
  expect(() => getRigE2EBin(environment)).toThrow(
    'RIG_E2E_BIN names no rig bin; run the e2e lane through `bun run test:e2e`, which packs rig',
  );
});
