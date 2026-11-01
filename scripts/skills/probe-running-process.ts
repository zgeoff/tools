// A signal of 0 checks the process without touching it; a process of another user still runs.
export function probeRunningProcess(processID: string): boolean {
  const id = Number(processID);

  // Signal 0 to 0 or below reaches a whole process group, not one process.
  if (!Number.isSafeInteger(id) || id <= 0) {
    return false;
  }

  try {
    process.kill(id, 0);

    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
