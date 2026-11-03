import type { LaneContext } from '@zgeoff/rig';
import removeRigPack from './remove-rig-pack.ts';

export default async function stopE2ELane(context: LaneContext): Promise<void> {
  await removeRigPack(context);
}
