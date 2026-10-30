import { hostname } from 'node:os';
import type { LaneContext } from '@zgeoff/rig';
import { removePath } from '../packages/rig/src/browser/remove-path.ts';
import { buildRigPackRun } from './build-rig-pack-run.ts';

export default async function removeRigPack(context: LaneContext): Promise<void> {
  await removePath(buildRigPackRun(context.repoRoot, hostname(), context.runID).runDir);
}
