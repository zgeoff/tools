import { expect, test } from 'bun:test';
import { buildProbeRun } from './build-probe-run.ts';

test('it finds each run in the list live, and no other', async () => {
  const probeRun = buildProbeRun(['4417', '5120']);

  const live = await Promise.all(['4417', '5120', '6001'].map((runID) => probeRun(runID)));

  expect(live).toStrictEqual([true, true, false]);
});
