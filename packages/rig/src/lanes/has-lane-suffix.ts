export function hasLaneSuffix(file: string, suffix: string): boolean {
  return file.endsWith(`${suffix}.test.ts`) || file.endsWith(`${suffix}.test.tsx`);
}
