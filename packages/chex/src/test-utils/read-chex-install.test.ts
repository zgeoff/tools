import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { updateEnv } from '@zgeoff/testing';
import { readChexInstall } from './read-chex-install.ts';

test('it reads the packed chex from the artifact that rig e2e names', async () => {
  updateEnv('RIG_PROGRAM_CHEX', '/srv/pack/package/src/cli.ts');

  const install = await readChexInstall();

  expect(install).toStrictEqual({
    packageDir: '/srv/pack/package',
    binPath: '/srv/pack/package/src/cli.ts',
  });
});

test('it reads the chex source when no artifact is named', async () => {
  updateEnv('RIG_PROGRAM_CHEX', undefined);
  updateEnv('CI', undefined);

  const install = await readChexInstall();

  expect(install.packageDir).toBe(join(import.meta.dir, '../..'));
});

test('it throws when the artifact is no src/cli.ts', () => {
  updateEnv('RIG_PROGRAM_CHEX', '/srv/pack/chex');

  expect(readChexInstall()).rejects.toThrow(
    'the chex program runs /srv/pack/chex, which ends with no src/cli.ts',
  );
});
