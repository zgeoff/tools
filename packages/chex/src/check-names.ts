export const docsCheckNames = ['prose', 'length', 'links', 'readmes', 'vision', 'skill'] as const;

// The docs checks come first, so a usage message lists them before the repo checks.
export const checkNames = [
  ...docsCheckNames,
  'commits',
  'local-paths',
  'test-timeouts',
  'test-layout',
  'workflows',
  'dependency-gates',
  'uncommitted',
] as const;

export type CheckName = (typeof checkNames)[number];

export function isCheckName(value: string): value is CheckName {
  return checkNames.some((name) => name === value);
}
