import { expect, test } from 'bun:test';
import { buildInFlightRun } from './build-in-flight-run.ts';

test('it counts the calls that started before the earlier ones settled', async () => {
  const inFlightRun = buildInFlightRun();

  await Promise.all([inFlightRun.run(), inFlightRun.run(), inFlightRun.run()]);

  expect(inFlightRun.inFlightAtStart).toStrictEqual([1, 2, 3]);
});

test('it counts a call that starts after the earlier one settled as alone', async () => {
  const inFlightRun = buildInFlightRun();

  await inFlightRun.run();
  await inFlightRun.run();

  expect(inFlightRun.inFlightAtStart).toStrictEqual([1, 1]);
});
