// Turns file content into the short hash that both snapshots of a Bash command compare.
export function toContentHash(bytes: Uint8Array): string {
  return Bun.hash(bytes).toString(16);
}
