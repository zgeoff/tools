import { probeProcess } from './probe-process.ts';
import { readProcessTable } from './read-process-table.ts';

export function probeHostProcess(pid: number): boolean {
  return probeProcess(pid, {
    signalProcess: (target, signal) => {
      process.kill(target, signal);
    },
    readProcessTable,
  });
}
