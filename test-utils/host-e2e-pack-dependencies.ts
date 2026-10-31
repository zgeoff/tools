import { hostname, tmpdir, userInfo } from 'node:os';
import { $ } from 'bun';
import { laneFiles } from '../packages/rig/src/browser/lane-files.ts';
import { initFiles } from '../packages/rig/src/init-files.ts';
import type { E2EPackDependencies } from './e2e-pack-dependencies.ts';
import { probeProcess } from './probe-process.ts';

export const hostE2EPackDependencies: E2EPackDependencies = {
  hostName: hostname(),
  tempDir: tmpdir(),
  userID: userInfo().uid,
  files: laneFiles,
  packedFiles: initFiles,
  probeProcess,
  runCommand: async (command, cwd) => {
    const result = await $`${command}`.cwd(cwd).quiet().nothrow();

    if (result.exitCode !== 0) {
      throw new Error(
        `${command.join(' ')} exited ${result.exitCode}: ${result.stderr.toString().trim()}`,
      );
    }
  },
};
