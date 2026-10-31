import type { FileLocks } from './file-locks.ts';
import type { Clock } from './system-clock.ts';
import { withFileLock } from './with-file-lock.ts';

export interface RigTarballOptions {
  readonly locks: FileLocks;

  readonly clock: Clock;

  readonly runBuild: () => Promise<void>;

  readonly runPack: () => Promise<void>;
}

// A build and a pack take under a second, so a wait this long means the holder hangs.
const lockWaitDeadlineMs = 120_000;

// bun pm pack resolves workspace: and catalog: ranges only for a package inside the workspace, so a
// per-run copy of rig cannot pack, and every run builds into rig's one dist folder. One lock spans
// the build and the pack, so no run empties dist while another packs it.
export function createRigTarball(lockPath: string, options: RigTarballOptions): Promise<void> {
  return withFileLock(
    lockPath,
    {
      locks: options.locks,
      clock: options.clock,
      retryMs: 50,
      waitDeadlineMs: lockWaitDeadlineMs,
    },
    async () => {
      await options.runBuild();
      await options.runPack();
    },
  );
}
