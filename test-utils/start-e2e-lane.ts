import type { LaneContext, LaneStart } from '@zgeoff/rig';
import { createChexPack } from './create-chex-pack.ts';
import createRigPack from './create-rig-pack.ts';

// The journeys drive rig's and chex's bins as a user installs them, so the lane packs both.
export default async function startE2ELane(context: LaneContext): Promise<LaneStart> {
  const rig = await createRigPack(context);
  const chex = await createChexPack(context);

  return { environment: { ...rig.environment, ...chex.environment } };
}
