import { expect, mock, test } from 'bun:test';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { defineRig } from './define-rig.ts';
import type { InitFiles } from './init-files.ts';
import { runInit } from './run-init.ts';

function setupTest() {
  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  const initFiles = {
    readJSON: mock<InitFiles['readJSON']>(() => Promise.resolve({})),
    writeText: mock<InitFiles['writeText']>(() => Promise.resolve()),
    probeFile: mock<InitFiles['probeFile']>(() => Promise.resolve(false)),
  };

  return {
    output,
    initFiles,
    deps: {
      readTrackedFiles: mock<(repoRoot: string) => Promise<readonly string[]>>(() =>
        Promise.resolve([]),
      ),
      initFiles,
      output,
    },
  };
}

test('it writes the test scripts and a starter rig.config.ts', async () => {
  const ctx = setupTest();

  ctx.initFiles.readJSON.mockResolvedValue({ name: 'notes', scripts: { lint: 'oxlint' } });
  ctx.deps.readTrackedFiles.mockResolvedValue(['src/clock.host.test.ts']);

  const exitCode = await runInit('/repo', defineRig({}), ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.initFiles.readJSON).toHaveBeenCalledExactlyOnceWith('/repo/package.json');

  expect(ctx.initFiles.writeText.mock.calls).toStrictEqual([
    [
      '/repo/package.json',
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
    ],
    [
      '/repo/rig.config.ts',
      "import { defineRig } from '@zgeoff/rig';\n\nexport default defineRig({ lanes: {} });\n",
    ],
  ]);
});

test('it writes the browser lane script when git tracks a browser suite', async () => {
  const ctx = setupTest();

  ctx.initFiles.readJSON.mockResolvedValue({ name: 'kettle' });
  ctx.initFiles.probeFile.mockResolvedValue(true);
  ctx.deps.readTrackedFiles.mockResolvedValue(['src/spout.browser.test.ts']);

  await runInit('/repo', defineRig({}), ctx.deps);

  const [path, text] = ctx.initFiles.writeText.mock.calls[0] ?? [];
  const manifest: unknown = JSON.parse(text ?? 'null');

  expect(path).toBe('/repo/package.json');

  expect(manifest).toStrictEqual({
    name: 'kettle',
    scripts: { test: 'rig unit', 'test:related': 'rig related', 'test:browser': 'rig browser' },
  });
});

test('it writes nothing when the scripts and the config are in place', async () => {
  const ctx = setupTest();

  ctx.initFiles.readJSON.mockResolvedValue({
    scripts: { test: 'rig unit', 'test:related': 'rig related' },
  });

  ctx.initFiles.probeFile.mockResolvedValue(true);

  const exitCode = await runInit('/repo', defineRig({}), ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.initFiles.probeFile).toHaveBeenCalledExactlyOnceWith('/repo/rig.config.ts');
  expect(ctx.initFiles.writeText).not.toHaveBeenCalled();
  expect(ctx.output.out).not.toHaveBeenCalled();
});

test('it keeps a rig.config.ts that the repo already has', async () => {
  const ctx = setupTest();

  ctx.initFiles.probeFile.mockResolvedValue(true);

  await runInit('/repo', defineRig({}), ctx.deps);

  const paths = ctx.initFiles.writeText.mock.calls.map(([path]) => path);

  expect(paths).toStrictEqual(['/repo/package.json']);
});

test('it refuses a package.json that holds no object, and writes nothing', async () => {
  const ctx = setupTest();

  ctx.initFiles.readJSON.mockResolvedValue([]);

  const exitCode = await runInit('/repo', defineRig({}), ctx.deps);

  expect(exitCode).toBe(2);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig init: /repo/package.json must hold a JSON object\n',
  );

  expect(ctx.initFiles.writeText).not.toHaveBeenCalled();
});
