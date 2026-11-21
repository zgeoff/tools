import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createTempDir } from '../src/fs/create-temp-dir.ts';
import { writeTreeFiles } from '../src/fs/write-tree-files.ts';
import { run } from '../src/process/index.ts';

async function setupTest() {
  const directory = createTempDir('preload-fixture');
  const updateEnvPath = join(import.meta.dir, '../src/core/update-env.ts');
  const preloadPath = join(import.meta.dir, '../src/preload/index.ts');

  await writeTreeFiles(directory.path, {
    'probe.test.ts': [
      `import { expect, test } from 'bun:test';`,
      `import { updateEnv } from '${updateEnvPath}';`,
      '',
      `test('it changes the env', () => {`,
      `  updateEnv('KIT_PRELOAD_PROBE', 'changed');`,
      `  expect(process.env['KIT_PRELOAD_PROBE']).toBe('changed');`,
      '});',
      '',
      `test('it sees the env as it was', () => {`,
      `  expect(process.env['KIT_PRELOAD_PROBE']).toBeUndefined();`,
      '});',
      '',
    ].join('\n'),
  });

  return { directory: directory.path, preloadPath };
}

test('it restores the env that updateEnv changed after each test', async () => {
  const ctx = await setupTest();

  const result = await run(['bun', 'test', '--preload', ctx.preloadPath, 'probe.test.ts'], {
    cwd: ctx.directory,
    timeoutMs: 30_000,
  });

  expect(result.exitCode).toBe(0);
});

test('it leaves the env changed when the preload is not listed', async () => {
  const ctx = await setupTest();

  const result = await run(['bun', 'test', 'probe.test.ts'], {
    cwd: ctx.directory,
    timeoutMs: 30_000,
  });

  expect(result.exitCode).toBe(1);
});
