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
): PackageScripts {
  const laneScripts = config.lanes
    .filter((lane) => lane.name !== 'unit' && isLaneWanted(lane, trackedFiles))
    .map((lane): [string, string] => [`test:${lane.name}`, `rig ${lane.name}`]);

  return {
    ...oldScripts,
    test: 'rig unit',
    'test:related': 'rig related',
    ...Object.fromEntries(laneScripts),
  };
}

function isLaneWanted(lane: ResolvedLane, trackedFiles: readonly string[]): boolean {
  if (!standardLanes.some((standard) => standard.name === lane.name)) {
    return true;
  }

  if (lane.suffix === null) {
    return pickE2EDirs(trackedFiles).length > 0;
  }

  const suffix = lane.suffix;

  return trackedFiles.some(
    (file) => file.endsWith(`${suffix}.test.ts`) || file.endsWith(`${suffix}.test.tsx`),
  );
}
