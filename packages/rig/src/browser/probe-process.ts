import { hasErrorCode } from './has-error-code.ts';
import { isZombieState } from './is-zombie-state.ts';
import type { ProcessEntry } from './read-process-table.ts';

export interface ProcessProbeDependencies {
  // Throws as `process.kill` does: ESRCH for a missing process, EPERM for another user's.
  readonly signalProcess: (pid: number, signal: number) => void;

  readonly readProcessTable: () => readonly ProcessEntry[] | null;
}

// A signal of 0 checks the process without signalling it. EPERM means the process runs under
// another user. A signal of 0 also reaches a zombie, which a host whose first process never reaps
// its orphans keeps forever, so the probe reads the state too.
export function probeProcess(pid: number, dependencies: ProcessProbeDependencies): boolean {
  try {
    dependencies.signalProcess(pid, 0);
  } catch (error) {
    if (!hasErrorCode(error, 'EPERM')) {
      return false;
    }
  }

  const table = dependencies.readProcessTable();

  // A failed listing leaves the state unknown, and a sweep removes only what has exited, so the
  // process counts as live.
  if (table === null) {
    return true;
  }

  const entry = table.find((candidate) => candidate.pid === pid);

  return entry !== undefined && !isZombieState(entry.state);
}
