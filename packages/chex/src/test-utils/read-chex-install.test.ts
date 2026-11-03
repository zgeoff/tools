import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { readChexInstall } from './read-chex-install.ts';

function setupTest(artifact: string | undefined) {
  const previous = process.env['RIG_PROGRAM_CHEX'];

  if (artifact === undefined) {
    delete process.env['RIG_PROGRAM_CHEX'];
  } else {
    process.env['RIG_PROGRAM_CHEX'] = artifact;
  }

  onTestFinished(() => {
    if (previous === undefined) {
      delete process.env['RIG_PROGRAM_CHEX'];
    } else {
      process.env['RIG_PROGRAM_CHEX'] = previous;
    }
  });
}

test('it reads the packed chex from the artifact that rig e2e names', async () => {
  setupTest('/srv/pack/package/src/cli.ts');

  const install = await readChexInstall();

  expect(install).toStrictEqual({
    packageDir: '/srv/pack/package',
    binPath: '/srv/pack/package/src/cli.ts',
  });
});

test('it reads the chex source when no artifact is named', async () => {
  setupTest(undefined);

  const previousCI = process.env['CI'];

  delete process.env['CI'];

  onTestFinished(() => {
    if (previousCI !== undefined) {
      process.env['CI'] = previousCI;
    }
  });

  const install = await readChexInstall();

  expect(install.packageDir).toBe(join(import.meta.dir, '../..'));
});

test('it throws when the artifact is no src/cli.ts', () => {
  setupTest('/srv/pack/chex');

  expect(readChexInstall()).rejects.toThrow(
    'the chex program runs /srv/pack/chex, which ends with no src/cli.ts',
  );
});
