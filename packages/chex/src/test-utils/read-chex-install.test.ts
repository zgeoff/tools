import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { removeEnvOverrides, updateEnv } from '@zgeoff/testing/helpers';
import { readChexInstall } from './read-chex-install.ts';

// updateEnv records each original, and removeEnvOverrides puts it back after the test
function setupTest() {
  onTestFinished(removeEnvOverrides);
}

test('it reads the packed chex from the artifact that rig e2e names', async () => {
  setupTest();
  updateEnv('RIG_PROGRAM_CHEX', '/srv/pack/package/src/cli.ts');

  const install = await readChexInstall();

  expect(install).toStrictEqual({
    packageDir: '/srv/pack/package',
    binPath: '/srv/pack/package/src/cli.ts',
  });
});

test('it reads the chex source when no artifact is named', async () => {
  setupTest();
  updateEnv('RIG_PROGRAM_CHEX', undefined);
  updateEnv('CI', undefined);

  const install = await readChexInstall();

  expect(install.packageDir).toBe(join(import.meta.dir, '../..'));
});

test('it throws when the artifact is no src/cli.ts', () => {
  setupTest();
  updateEnv('RIG_PROGRAM_CHEX', '/srv/pack/chex');

  expect(readChexInstall()).rejects.toThrow(
    'the chex program runs /srv/pack/chex, which ends with no src/cli.ts',
  );
});
