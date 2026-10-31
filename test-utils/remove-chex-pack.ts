import type { LaneContext } from '@zgeoff/rig';
import { buildChexPackRun } from './build-chex-pack-run.ts';
import type { E2EPackDependencies } from './e2e-pack-dependencies.ts';

export async function removeChexPack(
  context: LaneContext,
  dependencies: Pick<E2EPackDependencies, 'hostName' | 'files'>,
): Promise<void> {
  await dependencies.files.removePath(
    buildChexPackRun(context.repoRoot, dependencies.hostName, context.runID).runDir,
  );
}
