import { defineRig } from '@zgeoff/rig';

export default defineRig({
  lanes: {
    e2e: { start: './test-utils/start-e2e-lane.ts', stop: './test-utils/stop-e2e-lane.ts' },
  },
});
