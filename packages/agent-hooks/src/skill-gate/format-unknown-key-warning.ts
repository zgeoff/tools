export function formatUnknownKeyWarning(key: string): string {
  return `skill-gate: .claude/skill-gate.json holds the key \`${key}\`, which this version of @zgeoff/skill-gate does not know. The gate skips the key and keeps the rest of the rules; update the package or remove the key.`;
}
