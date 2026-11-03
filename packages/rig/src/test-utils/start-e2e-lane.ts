import type { LaneContext, LaneStart } from '@zgeoff/rig';
import createRigPack from './create-rig-pack.ts';
import { hostE2EPackDependencies } from './host-e2e-pack-dependencies.ts';

// The lane packs rig once per run, and its Chrome warm-up runs the packed bin.
export default function startE2ELane(context: LaneContext): Promise<LaneStart> {
  return createRigPack(context, hostE2EPackDependencies);
}
