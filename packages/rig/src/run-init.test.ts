import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { writeTreeFiles } from '../../../test-utils/write-tree-files.ts';
import { defineRig } from './define-rig.ts';
import { runInit } from './run-init.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'rig-init-test-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return {
    repoRoot,
    output,
    deps: { readTrackedFiles: () => Promise.resolve(['src/clock.host.test.ts']), output },
  };
}

test('it writes the test scripts and a starter rig.config.ts', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': JSON.stringify({ name: 'notes', scripts: { lint: 'oxlint' } }),
  });

  const exitCode = await runInit(ctx.repoRoot, defineRig({}), ctx.deps);
  const manifest: unknown = await Bun.file(join(ctx.repoRoot, 'package.json')).json();
  const config = await readFile(join(ctx.repoRoot, 'rig.config.ts'), 'utf8');

  expect(exitCode).toBe(0);

  expect(manifest).toStrictEqual({
    name: 'notes',
    scripts: {
      lint: 'oxlint',
      test: 'rig unit',
      'test:related': 'rig related',
      'test:host': 'rig host',
    },
  });

  expect(config).toBe(
    "import { defineRig } from '@zgeoff/rig';\n\nexport default defineRig({ lanes: {} });\n",
  );
});

test('it writes the browser lane script when git tracks a browser suite', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, { 'package.json': JSON.stringify({ name: 'kettle' }) });

  await runInit(ctx.repoRoot, defineRig({}), {
    ...ctx.deps,
    readTrackedFiles: () => Promise.resolve(['src/spout.browser.test.ts']),
  });

  const manifest: unknown = await Bun.file(join(ctx.repoRoot, 'package.json')).json();

  expect(manifest).toStrictEqual({
    name: 'kettle',
    scripts: { test: 'rig unit', 'test:related': 'rig related', 'test:browser': 'rig browser' },
  });
});

test('it changes nothing on a second run', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, { 'package.json': JSON.stringify({ scripts: {} }) });
  await runInit(ctx.repoRoot, defineRig({}), ctx.deps);

  const manifestBefore = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');
  const configStatBefore = await stat(join(ctx.repoRoot, 'rig.config.ts'));

  ctx.output.out.mockClear();

  const exitCode = await runInit(ctx.repoRoot, defineRig({}), ctx.deps);
  const manifestAfter = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');
  const configStatAfter = await stat(join(ctx.repoRoot, 'rig.config.ts'));

  expect(exitCode).toBe(0);
  expect(manifestAfter).toBe(manifestBefore);
  expect(configStatAfter.mtimeMs).toBe(configStatBefore.mtimeMs);
  expect(ctx.output.out).not.toHaveBeenCalled();
});

test('it keeps a rig.config.ts that the repo already has', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{}',
    'rig.config.ts': "export default 'mine';\n",
  });

  await runInit(ctx.repoRoot, defineRig({}), ctx.deps);

  const config = await readFile(join(ctx.repoRoot, 'rig.config.ts'), 'utf8');

  expect(config).toBe("export default 'mine';\n");
});

test('it refuses a package.json that holds no object', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, { 'package.json': '[]' });

  const exitCode = await runInit(ctx.repoRoot, defineRig({}), ctx.deps);

  expect(exitCode).toBe(2);
  expect(ctx.output.err).toHaveBeenCalledTimes(1);
});
