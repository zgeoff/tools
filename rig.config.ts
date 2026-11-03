import { defineRig } from '@zgeoff/rig';

export default defineRig({
  lanes: {
    e2e: {
      start: './packages/rig/src/test-utils/start-e2e-lane.ts',
      stop: './packages/rig/src/test-utils/stop-e2e-lane.ts',
    },
  },
});
