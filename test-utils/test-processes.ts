import type { ProcessGroups } from '../sync/browser-lane/process-groups.ts';
import { processGroups } from '../sync/browser-lane/process-groups.ts';

export interface TestProcesses {
  readonly listChildPids: (pid: number) => readonly number[];

  // Null when no process runs with the ID.
  readonly readGroupID: (pid: number) => number | null;

  readonly signalGroup: ProcessGroups['signalGroup'];
}

export const testProcesses: TestProcesses = {
  listChildPids: (pid) =>
    readNumbers(Bun.spawnSync(['pgrep', '-P', String(pid)]).stdout.toString()),
  readGroupID: (pid) =>
    readNumbers(Bun.spawnSync(['ps', '-o', 'pgid=', '-p', String(pid)]).stdout.toString())[0] ??
    null,
  signalGroup: processGroups.signalGroup,
};

function readNumbers(text: string): number[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map(Number);
}
