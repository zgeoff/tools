// The shell leads its process group, so its process ID is the group ID. It records the group by
// moving the lane's pending record, and a rename either wins or loses against a sweep's removal,
// so a command whose record the sweep removed never starts.
const recordScript = 'mv -- "$1" "$0/$$" && shift && exec "$@"';

export function buildRecordedCommand(
  groupsDir: string,
  pendingRecord: string,
  command: readonly string[],
): readonly string[] {
  return ['/bin/sh', '-c', recordScript, groupsDir, pendingRecord, ...command];
}
