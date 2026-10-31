import { hostname } from 'node:os';
import type { LaneContext } from '@zgeoff/rig';
import { removePath } from '../packages/rig/src/browser/remove-path.ts';
import { buildChexPackRun } from './build-chex-pack-run.ts';

export async function removeChexPack(context: LaneContext): Promise<void> {
  await removePath(buildChexPackRun(context.repoRoot, hostname(), context.runID).runDir);
}
