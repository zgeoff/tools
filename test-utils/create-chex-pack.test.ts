import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LaneContext } from '@zgeoff/rig';
import { laneFiles } from '../packages/rig/src/browser/lane-files.ts';
import { initFiles } from '../packages/rig/src/init-files.ts';
import { buildStubCommandRunner } from './build-stub-command-runner.ts';
import { createChexPack } from './create-chex-pack.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'create-chex-pack-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  const context: LaneContext = {
    repoRoot,
    runID: '4417',
    lane: {
      name: 'e2e',
      suffix: null,
      limitMs: 60_000,
      parallel: 1,
      memory: null,
      start: './start.ts',
      stop: './stop.ts',
    },
    environment: {},
  };

  const runDir = join(repoRoot, 'packages/chex/node_modules/.cache/chex-e2e/galley/4417');

  const pack = (answers: Readonly<Record<string, string | null>>) => {
    const commands = buildStubCommandRunner(answers);

    const start = createChexPack(context, {
      hostName: 'galley',
      tempDir: tmpdir(),
      userID: 1000,
      files: laneFiles,
      packedFiles: initFiles,
      probeProcess: () => true,
      runCommand: commands.runCommand,
    });

    return { start, calls: commands.calls };
  };

  return { repoRoot, runDir, pack };
}

test("it packs chex into the run's folder, extracts the tarball and returns the packed bin", async () => {
  const ctx = await setupTest();

  const tarballPath = join(ctx.runDir, 'chex.tgz');

  // The files that the stub tar stands for extracting.
  await writeTreeFiles(join(ctx.runDir, 'package'), {
    'package.json': JSON.stringify({ bin: { chex: './src/cli.ts' } }),
    'src/cli.ts': 'export {};\n',
  });

  const run = ctx.pack({
    [`${process.execPath} pm pack --filename ${tarballPath} --quiet`]: null,
    [`tar -xzf ${tarballPath} -C ${ctx.runDir}`]: null,
  });

  const start = await run.start;

  expect(start).toStrictEqual({
    environment: {
      CHEX_E2E_PACKAGE: join(ctx.runDir, 'package'),
      CHEX_E2E_BIN: join(ctx.runDir, 'package/src/cli.ts'),
    },
  });

  expect(run.calls).toStrictEqual([
    {
      command: [process.execPath, 'pm', 'pack', '--filename', tarballPath, '--quiet'],
      cwd: join(ctx.repoRoot, 'packages/chex'),
    },
    { command: ['tar', '-xzf', tarballPath, '-C', ctx.runDir], cwd: ctx.runDir },
  ]);
});

test('it rejects with the pack failure, and never extracts the tarball', async () => {
  const ctx = await setupTest();

  const tarballPath = join(ctx.runDir, 'chex.tgz');

  const run = ctx.pack({
    [`${process.execPath} pm pack --filename ${tarballPath} --quiet`]: 'bun pm pack exited 1',
  });

  expect(run.start).rejects.toThrow('bun pm pack exited 1');
  expect(run.calls.map((call) => call.command[0])).toStrictEqual([process.execPath]);
});
