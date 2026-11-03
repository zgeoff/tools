export function buildTimeoutSource(timeoutMs: number): string {
  return `import { test } from 'bun:test';\n\ntest('it bakes', () => {}, ${timeoutMs});\n`;
}
