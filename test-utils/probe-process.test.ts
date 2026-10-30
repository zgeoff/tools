import { expect, test } from 'bun:test';
import { probeProcess as laneProbeProcess } from '../packages/rig/src/browser/probe-process.ts';
import { probeProcess } from './probe-process.ts';

test("it is the lane's probe, so a test finds a zombie exited as the lane does", () => {
  expect(probeProcess).toBe(laneProbeProcess);
});
