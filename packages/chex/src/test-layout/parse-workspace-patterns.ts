export type ParsedWorkspaces =
  | { readonly kind: 'single' }
  | { readonly kind: 'workspaces'; readonly patterns: readonly string[] };

// A root package.json declares workspaces as a list, or as an object with a `packages` list.
export function parseWorkspacePatterns(manifest: unknown): ParsedWorkspaces {
  const workspaces: unknown =
    typeof manifest === 'object' && manifest !== null
      ? Reflect.get(manifest, 'workspaces')
      : undefined;

  if (workspaces === undefined) {
    return { kind: 'single' };
  }

  const list: unknown =
    typeof workspaces === 'object' && workspaces !== null && !Array.isArray(workspaces)
      ? Reflect.get(workspaces, 'packages')
      : workspaces;

  return {
    kind: 'workspaces',
    patterns: Array.isArray(list)
      ? list.filter((pattern): pattern is string => typeof pattern === 'string')
      : [],
  };
}
