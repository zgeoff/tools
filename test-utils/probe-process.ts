// A signal of 0 checks the process without signalling it. EPERM means the process runs under
// another user.
export function probeProcess(processID: number): boolean {
  try {
    process.kill(processID, 0);

    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
