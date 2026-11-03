import type { LaneContext } from '@zgeoff/rig';
import { hostE2EPackDependencies } from './host-e2e-pack-dependencies.ts';
import { removeChexPack } from './remove-chex-pack.ts';
import removeRigPack from './remove-rig-pack.ts';

export default async function stopE2ELane(context: LaneContext): Promise<void> {
  await removeRigPack(context);
  await removeChexPack(context, hostE2EPackDependencies);
}
