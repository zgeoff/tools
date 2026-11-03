import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBlockingStubKit } from '@zgeoff/std/test-utils/create-blocking-stub-kit';
import { makeResolvingStub } from '@zgeoff/std/test-utils/make-resolving-stub';
import { buildSignallingClock } from './build-signalling-clock.ts';
import { createRigTarball } from './create-rig-tarball.ts';
import { fileLocks } from './file-locks.ts';
import { systemClock } from './system-clock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `rig-tarball-${process.pid}-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { lockPath: join(directory, 'build.lock') };
}

test("it starts a second run's build only once the first run has packed", async () => {
  const ctx = await setupTest();

  const firstBuild = createBlockingStubKit(undefined);
  const firstPack = makeResolvingStub(undefined);
  const secondBuild = makeResolvingStub(undefined);

  const first = createRigTarball(ctx.lockPath, {
    locks: fileLocks,
    clock: systemClock,
    runBuild: firstBuild.stub,
    runPack: firstPack,
  });

  await firstBuild.firstCall;

  const signalling = buildSignallingClock();

  const second = createRigTarball(ctx.lockPath, {
    locks: fileLocks,
    clock: signalling.clock,
    runBuild: secondBuild,
    runPack: makeResolvingStub(undefined),
  });

  await signalling.firstSleep;

  const hasSecondBuiltWhileHeld = secondBuild.mock.calls.length > 0;

  firstBuild.release();

  await Promise.all([first, second]);

  expect(hasSecondBuiltWhileHeld).toBeFalse();
  expect(firstPack).toHaveBeenCalledBefore(secondBuild);
});

test('it packs after it builds', async () => {
  const ctx = await setupTest();

  const build = makeResolvingStub(undefined);
  const pack = makeResolvingStub(undefined);

  await createRigTarball(ctx.lockPath, {
    locks: fileLocks,
    clock: systemClock,
    runBuild: build,
    runPack: pack,
  });

  expect(build).toHaveBeenCalledBefore(pack);
});
