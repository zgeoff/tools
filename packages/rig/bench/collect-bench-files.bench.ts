import { defineBench } from '@zgeoff/rig/bench';
import { collectBenchFiles } from '../src/collect-bench-files.ts';

export default defineBench({
  name: 'collect bench files',
  budget: '20ms',
  setup: () =>
    Promise.resolve(Array.from({ length: 500 }, (_, index) => buildTrackedFiles(index)).flat()),
  run: (trackedFiles) => {
    collectBenchFiles(trackedFiles, true);
  },
});

function buildTrackedFiles(index: number): readonly string[] {
  const packageFolder = `packages/kettle-${index % 50}`;

  return [
    `${packageFolder}/src/pour-cup-${index}.ts`,
    `${packageFolder}/bench/boil-${index}.bench.ts`,
    `${packageFolder}/package.json`,
    `docs/guides/steep-${index}.md`,
  ];
}
