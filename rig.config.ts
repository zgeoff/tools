import { defineRig } from '@zgeoff/rig';

// The isolated linker links chex's dependencies into chex's own node_modules and not the root's,
// so the pack sits inside that folder, where Bun's walk up from the packed files finds them.
const chexPack = 'node_modules/.cache/chex-e2e';

export default defineRig({
  programs: {
    // chex ships its source, so the tarball, shaped by the files list and the rewritten dependency
    // ranges, is the product a user installs, and the e2e tests run its bin.
    chex: {
      package: 'packages/chex',
      source: 'src/cli.ts',
      build: `rm -rf ${chexPack} && mkdir -p ${chexPack} && bun pm pack --filename "$PWD/${chexPack}/chex.tgz" --quiet && tar -xzf ${chexPack}/chex.tgz -C ${chexPack}`,
      artifact: `${chexPack}/package/src/cli.ts`,
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
