// Tells whether any process still runs in the group.
export function probeGroup(groupID: number): boolean {
  try {
    process.kill(-groupID, 0);

    return true;
  } catch {
    return false;
  }
}
