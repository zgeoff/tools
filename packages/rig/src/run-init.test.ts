import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { writeTreeFiles } from '../../../test-utils/write-tree-files.ts';
import { defineRig } from './define-rig.ts';
import { initFiles } from './init-files.ts';
import { runInit } from './run-init.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'rig-init-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return {
    repoRoot,
    output,
    deps: {
      readTrackedFiles: mock<(repoRoot: string) => Promise<readonly string[]>>(),
      initFiles,
      output,
    },
  };
}

test('it writes the test scripts into package.json and a starter rig.config.ts', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': JSON.stringify({ name: 'notes', scripts: { lint: 'oxlint' } }),
  });

  ctx.deps.readTrackedFiles.mockResolvedValue(['src/clock.host.test.ts']);

  const exitCode = await runInit(ctx.repoRoot, defineRig({}), ctx.deps);
  const manifest = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');
  const config = await readFile(join(ctx.repoRoot, 'rig.config.ts'), 'utf8');

  expect(exitCode).toBe(0);

  expect(manifest).toBe(
    `${JSON.stringify(
      {
        name: 'notes',
        scripts: {
          lint: 'oxlint',
          test: 'rig unit',
          'test:related': 'rig related',
          'test:host': 'rig host',
        },
      },
      null,
      2,
    )}\n`,
  );

  expect(config).toBe(
    "import { defineRig } from '@zgeoff/rig';\n\nexport default defineRig({ lanes: {} });\n",
  );

  expect(ctx.output.out.mock.calls).toStrictEqual([
    ['rig init: wrote the test scripts to package.json\n'],
    ['rig init: wrote rig.config.ts\n'],
  ]);
});

test('it changes nothing on a second run', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': JSON.stringify({ name: 'notes', scripts: { lint: 'oxlint' } }),
  });

  ctx.deps.readTrackedFiles.mockResolvedValue(['src/clock.host.test.ts']);

  await runInit(ctx.repoRoot, defineRig({}), ctx.deps);

  const manifestAfterFirstRun = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');
  const configAfterFirstRun = await readFile(join(ctx.repoRoot, 'rig.config.ts'), 'utf8');
  const exitCode = await runInit(ctx.repoRoot, defineRig({}), ctx.deps);
  const manifest = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');
  const config = await readFile(join(ctx.repoRoot, 'rig.config.ts'), 'utf8');

  expect(exitCode).toBe(0);
  expect(manifest).toBe(manifestAfterFirstRun);
  expect(config).toBe(configAfterFirstRun);

  expect(ctx.output.out.mock.calls).toStrictEqual([
    ['rig init: wrote the test scripts to package.json\n'],
    ['rig init: wrote rig.config.ts\n'],
  ]);
});

test('it writes the browser lane script when git tracks a browser suite', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, { 'package.json': JSON.stringify({ name: 'kettle' }) });

  ctx.deps.readTrackedFiles.mockResolvedValue(['src/spout.browser.test.ts']);

  await runInit(ctx.repoRoot, defineRig({}), ctx.deps);

  const manifestText = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');

  const manifest: unknown = JSON.parse(manifestText);

  expect(manifest).toStrictEqual({
    name: 'kettle',
    scripts: { test: 'rig unit', 'test:related': 'rig related', 'test:browser': 'rig browser' },
  });
});

test('it leaves a package.json alone that already holds the scripts', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{"scripts":{"test":"rig unit","test:related":"rig related"}}',
  });

  ctx.deps.readTrackedFiles.mockResolvedValue([]);

  await runInit(ctx.repoRoot, defineRig({}), ctx.deps);

  const manifest = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');

  expect(manifest).toBe('{"scripts":{"test":"rig unit","test:related":"rig related"}}');
});

test('it keeps a rig.config.ts that the repo already has', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': JSON.stringify({ name: 'kettle' }),
    'rig.config.ts': "export default { lanes: { kiln: { limit: '15s' } } };\n",
  });

  ctx.deps.readTrackedFiles.mockResolvedValue([]);

  await runInit(ctx.repoRoot, defineRig({}), ctx.deps);

  const config = await readFile(join(ctx.repoRoot, 'rig.config.ts'), 'utf8');

  expect(config).toBe("export default { lanes: { kiln: { limit: '15s' } } };\n");

  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith(
    'rig init: wrote the test scripts to package.json\n',
  );
});

test('it refuses a package.json that holds no object, and writes nothing', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, { 'package.json': '[]' });

  ctx.deps.readTrackedFiles.mockResolvedValue([]);

  const exitCode = await runInit(ctx.repoRoot, defineRig({}), ctx.deps);
  const manifest = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');
  const hasConfig = await Bun.file(join(ctx.repoRoot, 'rig.config.ts')).exists();

  expect(exitCode).toBe(2);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    `rig init: ${join(ctx.repoRoot, 'package.json')} must hold a JSON object\n`,
  );

  expect(manifest).toBe('[]');
  expect(hasConfig).toBeFalse();
});
