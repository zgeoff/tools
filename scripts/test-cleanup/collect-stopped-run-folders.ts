import { basename } from 'node:path';

// mkdtemp ends a name with six random characters, after the prefix a test gives it.
const runFolderPattern = /-pid(?<pid>\d+)-[\w]{6}$/u;

export function collectStoppedRunFolders(
  paths: readonly string[],
  isRunning: (pid: number) => boolean,
): string[] {
  return paths.filter((path) => {
    const pid = runFolderPattern.exec(basename(path))?.groups?.['pid'];

    return pid !== undefined && !isRunning(Number(pid));
  });
}
