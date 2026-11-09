import { basename } from 'node:path';

// mkdtemp ends a name with six random characters, after the prefix a test gives it.
const runFolderPattern = /-pid(?<pid>\d+)-ns(?<namespace>\w+)-[\w]{6}$/u;

// A PID from another PID namespace names a different process here, so only a folder from the
// sweep's own namespace can be judged stopped.
export function collectStoppedRunFolders(
  paths: readonly string[],
  namespace: string,
  isRunning: (pid: number) => boolean,
): string[] {
  return paths.filter((path) => {
    const groups = runFolderPattern.exec(basename(path))?.groups;
    const pid = groups?.['pid'];

    return (
      pid !== undefined &&
      groups?.['namespace'] === namespace &&
      namespace !== 'unknown' &&
      !isRunning(Number(pid))
    );
  });
}
