import { defineRig } from '@zgeoff/rig';

export default defineRig({
  lanes: {
    e2e: {
      start: './packages/rig/test-utils/start-e2e-lane.ts',
      stop: './packages/rig/test-utils/stop-e2e-lane.ts',
    },
  },
});
