import { join } from 'node:path';

export interface RigPackRun {
  // The folder that holds every run's pack on this host.
  readonly runsDir: string;

  readonly runDir: string;

  readonly tarballPath: string;

  readonly packageDir: string;
}

// The isolated linker links rig's dependencies into rig's own node_modules and not the root's, so
// the pack sits inside that folder, where Bun's walk up from the packed files finds them. Each host
// name keeps its own runs, because a container that mounts the repo sees other process IDs.
export function buildRigPackRun(repoRoot: string, hostName: string, runID: string): RigPackRun {
  const runsDir = join(repoRoot, 'packages', 'rig', 'node_modules', '.cache', 'rig-e2e', hostName);
  const runDir = join(runsDir, runID);

  return {
    runsDir,
    runDir,
    tarballPath: join(runDir, 'rig.tgz'),
    packageDir: join(runDir, 'package'),
  };
}
