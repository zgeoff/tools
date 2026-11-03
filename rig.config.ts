import { defineRig } from '@zgeoff/rig';

export default defineRig({
  programs: {
    // chex ships its source, so its bin runs the source and has nothing to build.
    chex: { package: 'packages/chex', source: 'src/cli.ts', build: 'true', artifact: 'src/cli.ts' },
    rig: { package: 'packages/rig', source: 'src/cli.ts', build: 'true', artifact: 'src/cli.ts' },
  },
  lanes: {
    e2e: {
      start: './packages/rig/src/test-utils/start-e2e-lane.ts',
      stop: './packages/rig/src/test-utils/stop-e2e-lane.ts',
    },
  },
});
