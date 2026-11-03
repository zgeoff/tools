import { buildProgramEnvironment } from './build-program-environment.ts';
import type { LaneHooks } from './lane-hooks.ts';
import type { ProgramDeclaration } from './types.ts';

// The programs' artifact paths reach the test or bench process beside whatever the lane's own start
// hook adds. `rig e2e` and `rig bench` both wrap their hooks with this.
export function buildProgramLaneHooks(
  hooks: LaneHooks,
  repoRoot: string,
  programs: Readonly<Record<string, ProgramDeclaration>>,
): LaneHooks {
  const programEnvironment = buildProgramEnvironment(repoRoot, programs);

  return {
    ...hooks,
    start: async () => {
      const started = await hooks.start();

      return started.kind === 'finish'
        ? started
        : { kind: 'proceed', environment: { ...started.environment, ...programEnvironment } };
    },
  };
}
