export function toContentHash(bytes: Uint8Array): string {
  return Bun.hash(bytes).toString(16);
}
