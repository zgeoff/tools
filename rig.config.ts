import { defineRig } from '@zgeoff/rig';

export default defineRig({
  programs: {
    // chex ships its source, so the tarball, shaped by the files list and the rewritten dependency
    // ranges, is the product a user installs, and the e2e tests run its bin.
    chex: {
      package: 'packages/chex',
      source: 'src/cli.ts',
      build: 'bun src/test-utils/pack-chex-program.ts "$PPID"',
      artifact: 'node_modules/.cache/chex-e2e/package/src/cli.ts',
    },

    // testing ships its source and drives fixture programs, so it has nothing to build.
    testing: {
      package: 'packages/testing',
      source: 'src/cli/index.ts',
      build: 'true',
      artifact: 'src/cli/index.ts',
    },
    rig: { package: 'packages/rig', source: 'src/cli.ts', build: 'true', artifact: 'src/cli.ts' },
  },
  lanes: {
    e2e: {
      start: './packages/rig/src/test-utils/start-e2e-lane.ts',
      stop: './packages/rig/src/test-utils/stop-e2e-lane.ts',
    },
  },
});
