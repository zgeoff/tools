import { probeProcess } from './probe-process.ts';
import { readProcessTable } from './read-process-table.ts';
import { signalHostProcess } from './signal-host-process.ts';

export function probeHostProcess(pid: number): boolean {
  return probeProcess(pid, {
    signalProcess: signalHostProcess,
    readProcessTable,
  });
}
