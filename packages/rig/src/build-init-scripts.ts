import { collectBenchFiles } from './collect-bench-files.ts';
import { collectEvalFiles } from './collect-eval-files.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import { standardLanes } from './standard-lanes.ts';
import type { ResolvedLane, RigConfig } from './types.ts';

export type PackageScripts = Readonly<Record<string, string>>;

// A lane the config adds always gets its script. A built-in lane gets one only when git tracks a
// test file for it, so a repo without browser tests has no `test:browser` job to run.
export function buildInitScripts(
  oldScripts: PackageScripts,
  config: RigConfig,
  trackedFiles: readonly string[],
  isWorkspaceRepo: boolean,
): PackageScripts {
  const laneScripts = config.lanes
    .filter((lane) => lane.name !== 'unit' && isLaneWanted(lane, trackedFiles, isWorkspaceRepo))
    .map((lane): [string, string] => [`test:${lane.name}`, `rig ${lane.name}`]);

  const benchScripts =
    collectBenchFiles(trackedFiles, isWorkspaceRepo).length > 0 ? { bench: 'rig bench' } : {};

  const evalScripts = collectEvalFiles(trackedFiles).length > 0 ? { eval: 'rig eval' } : {};

  const rigScripts: PackageScripts = {
    'test:related': 'rig related',
    ...Object.fromEntries(laneScripts),
    ...benchScripts,
    ...evalScripts,
  };

  // Renovate reruns init on each rig bump, so a script the repo already defines stays as it is.
  // Only `test` moves to `rig unit`, because that is how a repo adopts rig.
  const missingScripts = Object.entries(rigScripts).filter(
    ([name]) => !Object.hasOwn(oldScripts, name),
  );

  return { ...oldScripts, test: 'rig unit', ...Object.fromEntries(missingScripts) };
}

function isLaneWanted(
  lane: ResolvedLane,
  trackedFiles: readonly string[],
  isWorkspaceRepo: boolean,
): boolean {
  if (!standardLanes.some((standard) => standard.name === lane.name)) {
    return true;
  }

  if (lane.suffix === null) {
    return pickE2EDirs(trackedFiles, isWorkspaceRepo).length > 0;
  }

  const suffix = lane.suffix;

  return trackedFiles.some(
    (file) => file.endsWith(`${suffix}.test.ts`) || file.endsWith(`${suffix}.test.tsx`),
  );
}
