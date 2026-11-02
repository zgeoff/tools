import { expect, test } from 'bun:test';
import { getChexE2EPack } from './get-chex-e2e-pack.ts';

test('it reads the packed chex folder and bin from the environment', () => {
  const pack = getChexE2EPack({
    CHEX_E2E_PACKAGE: '/srv/pack/package',
    CHEX_E2E_BIN: '/srv/pack/package/src/cli.ts',
  });

  expect(pack).toStrictEqual({
    packageDir: '/srv/pack/package',
    binPath: '/srv/pack/package/src/cli.ts',
  });
});

test.each<[string, Readonly<Record<string, string | undefined>>]>([
  ['no variable', {}],
  ['no bin', { CHEX_E2E_PACKAGE: '/srv/pack/package' }],
  ['no folder', { CHEX_E2E_BIN: '/srv/pack/package/src/cli.ts' }],
  ['an empty folder', { CHEX_E2E_PACKAGE: '', CHEX_E2E_BIN: '/srv/pack/package/src/cli.ts' }],
])('it throws for an environment with %s', (_label, environment) => {
  expect(() => getChexE2EPack(environment)).toThrow(
    'CHEX_E2E_PACKAGE and CHEX_E2E_BIN name no packed chex; run the e2e lane through `bun run test:e2e`, which packs chex',
  );
});
