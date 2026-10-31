import { expect, mock, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTreeFiles } from '../../../test-utils/write-tree-files.ts';
import { defineRig } from './define-rig.ts';
import { readRigConfig } from './read-rig-config.ts';
import type { RigConfigSources } from './read-rig-config.ts';

test('it reads the built-in lanes from a repo with no rig.config.ts', async () => {
  const config = await readRigConfig('/bakery', {
    probeFile: () => false,
    importModule: () => Promise.resolve({}),
  });

  expect(config).toStrictEqual(defineRig({}));
});

test('it reads the lanes that a rig.config.ts declares', async () => {
  const config = await readRigConfig('/bakery', {
    probeFile: () => true,
    importModule: () =>
      Promise.resolve({ default: defineRig({ lanes: { kiln: { limit: '15s' } } }) }),
  });

  expect(config).toStrictEqual(defineRig({ lanes: { kiln: { limit: '15s' } } }));
});

test('it probes and imports the rig.config.ts at the repo root', async () => {
  const probeFile = mock<RigConfigSources['probeFile']>(() => true);

  const importModule = mock<RigConfigSources['importModule']>(() =>
    Promise.resolve({ default: defineRig({}) }),
  );

  await readRigConfig('/bakery', { probeFile, importModule });

  expect(probeFile.mock.calls).toStrictEqual([['/bakery/rig.config.ts']]);
  expect(importModule.mock.calls).toStrictEqual([['/bakery/rig.config.ts']]);
});

test("it refuses a rig.config.ts whose default export is no rig config, with the parser's reason", async () => {
  const failure = await readRigConfig('/bakery', {
    probeFile: () => true,
    importModule: () => Promise.resolve({ default: { lanes: 3 } }),
  }).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);

  expect(failure).toHaveProperty(
    'message',
    '/bakery/rig.config.ts must default-export the result of defineRig: its lanes are no list',
  );
});

test('it refuses a rig.config.ts with no default export', async () => {
  const failure = await readRigConfig('/bakery', {
    probeFile: () => true,
    importModule: () => Promise.resolve(null),
  }).catch((error: unknown) => error);

  expect(failure).toHaveProperty(
    'message',
    '/bakery/rig.config.ts must default-export the result of defineRig: the default export has no lanes',
  );
});

test('it reads a rig.config.ts from disk through the real file probe and importer', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'rig-config-test-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  const indexPath = join(import.meta.dir, 'index.ts');

  await writeTreeFiles(repoRoot, {
    'rig.config.ts': `import { defineRig } from ${JSON.stringify(indexPath)};\n\nexport default defineRig({ lanes: { kiln: { limit: '15s' } } });\n`,
  });

  const config = await readRigConfig(repoRoot, {
    probeFile: existsSync,
    importModule: (path) => import(path),
  });

  expect(config).toStrictEqual(defineRig({ lanes: { kiln: { limit: '15s' } } }));
});
