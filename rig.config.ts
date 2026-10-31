import { defineRig } from '@zgeoff/rig';

export default defineRig({
  lanes: {
    e2e: { start: './test-utils/create-rig-pack.ts', stop: './test-utils/remove-rig-pack.ts' },
  },
});
