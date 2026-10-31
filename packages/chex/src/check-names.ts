// The docs checks come first, then the repo checks, so a usage message lists them in that order.
export const checkNames = [
  'prose',
  'length',
  'links',
  'readmes',
  'vision',
  'skill',
  'commits',
  'local-paths',
  'test-timeouts',
  'workflows',
  'dependency-gates',
  'uncommitted',
] as const;

export type CheckName = (typeof checkNames)[number];

export function isCheckName(value: string): value is CheckName {
  return checkNames.some((name) => name === value);
}
