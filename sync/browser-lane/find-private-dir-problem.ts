import type { PathStatus } from './lane-files.ts';

export function findPrivateDirProblem(
  path: string,
  status: PathStatus | null,
  userID: number,
): string | null {
  if (status === null || !status.isDirectory) {
    return `the browser lane's temp folder ${path} is no folder of its own`;
  }

  if (status.ownerID !== userID) {
    return `the browser lane's temp folder ${path} belongs to user ${status.ownerID}, not to user ${userID}`;
  }

  const openBits = status.mode & 0o077;

  return openBits === 0
    ? null
    : `the browser lane's temp folder ${path} is open to other users, with mode ${(status.mode & 0o777).toString(8)}`;
}
