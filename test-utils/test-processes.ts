import type { ProcessGroups } from '../packages/rig/src/browser/process-groups.ts';
import { processGroups } from '../packages/rig/src/browser/process-groups.ts';
import type { Clock } from './system-clock.ts';
import { systemClock } from './system-clock.ts';

export interface TestProcesses extends Clock {
  readonly listChildPids: (pid: number) => readonly number[];

  // Null when no process runs with the ID.
  readonly readGroupID: (pid: number) => number | null;

  readonly signalGroup: ProcessGroups['signalGroup'];

  readonly probeGroup: ProcessGroups['probeGroup'];
}

export const testProcesses: TestProcesses = {
  listChildPids: (pid) =>
    readNumbers(Bun.spawnSync(['pgrep', '-P', String(pid)]).stdout.toString()),
  readGroupID: (pid) =>
    readNumbers(Bun.spawnSync(['ps', '-o', 'pgid=', '-p', String(pid)]).stdout.toString())[0] ??
    null,
  signalGroup: processGroups.signalGroup,
  probeGroup: processGroups.probeGroup,
  now: systemClock.now,
  sleep: systemClock.sleep,
};

function readNumbers(text: string): number[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map(Number);
}
