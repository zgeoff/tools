import { expect, test } from 'bun:test';
import type { LaneContext } from '@zgeoff/rig';
import { createChexPack } from './create-chex-pack.ts';
import type { E2EPackDependencies } from './e2e-pack-dependencies.ts';

function setupTest(failingCommand: string | null) {
  const commands: { readonly command: readonly string[]; readonly cwd: string }[] = [];
  const createdDirs: string[] = [];
  const readPaths: string[] = [];

  const context: LaneContext = {
    repoRoot: '/repo',
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

  const dependencies: E2EPackDependencies = {
    hostName: 'galley',
    tempDir: '/scratch',
    userID: 1000,
    files: {
      createDirs: (path) => {
        createdDirs.push(path);

        return Promise.resolve();
      },
      readDirNames: () => Promise.resolve([]),
      removePath: () => Promise.resolve(),
    },
    packedFiles: {
      readJSON: (path) => {
        readPaths.push(path);

        return Promise.resolve({ bin: { chex: './src/cli.ts' } });
      },
      probeFile: () => Promise.resolve(true),
    },
    probeProcess: () => false,
    runCommand: (command, cwd) => {
      commands.push({ command, cwd });

      return failingCommand !== null && command.includes(failingCommand)
        ? Promise.reject(new Error(`${failingCommand} exited 1`))
        : Promise.resolve();
    },
  };

  return { commands, createdDirs, readPaths, context, dependencies };
}

test("it packs chex into the run's folder, extracts the tarball and returns the packed bin", async () => {
  const ctx = setupTest(null);

  const start = await createChexPack(ctx.context, ctx.dependencies);

  const runDir = '/repo/packages/chex/node_modules/.cache/chex-e2e/galley/4417';

  expect(start).toStrictEqual({
    environment: {
      CHEX_E2E_PACKAGE: `${runDir}/package`,
      CHEX_E2E_BIN: `${runDir}/package/src/cli.ts`,
    },
  });

  expect(ctx.createdDirs).toStrictEqual([runDir]);

  expect(ctx.commands).toStrictEqual([
    {
      command: [process.execPath, 'pm', 'pack', '--filename', `${runDir}/chex.tgz`, '--quiet'],
      cwd: '/repo/packages/chex',
    },
    { command: ['tar', '-xzf', `${runDir}/chex.tgz`, '-C', runDir], cwd: runDir },
  ]);
});

test('it rejects with the pack failure, and never extracts or reads a bin', async () => {
  const ctx = setupTest('pack');
  const start = createChexPack(ctx.context, ctx.dependencies);

  await expect(start).rejects.toThrow('pack exited 1');

  expect(ctx.commands.map((call) => call.command[0])).toStrictEqual([process.execPath]);
  expect(ctx.readPaths).toStrictEqual([]);
});
