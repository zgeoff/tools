import { hasErrorCode } from './has-error-code.ts';
import { isZombieState } from './is-zombie-state.ts';

// A signal of 0 checks the process without signalling it. EPERM means the process runs under
// another user. A signal of 0 also reaches a zombie, which a host whose first process never reaps
// its orphans keeps forever, so the probe reads the state too.
export function probeProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (!hasErrorCode(error, 'EPERM')) {
      return false;
    }
  }

  // `ps` exits nonzero, and prints nothing, for a process that has exited since the signal.
  const listing = Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(pid)]);
  const state = listing.stdout.toString().trim();

  return state !== '' && !isZombieState(state);
}
