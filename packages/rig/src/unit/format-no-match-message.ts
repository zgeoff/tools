export function formatNoMatchMessage(laneName: string, paths: readonly string[]): string {
  return `rig: the ${laneName} lane has no tests that match ${paths.join(' ')}\n`;
}
