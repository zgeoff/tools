import { hasErrorCode } from './has-error-code.ts';

// A signal of 0 checks the process without signalling it. EPERM means the process runs under
// another user.
export function probeProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return hasErrorCode(error, 'EPERM');
  }
}
