import type { WorkspacePackage } from './types.ts';

// Reads the name and `private` flag of the package.json of each workspace folder.
export function readWorkspacePackages(
  roots: readonly string[],
  readText: (path: string) => Promise<string>,
): Promise<WorkspacePackage[]> {
  return Promise.all(
    roots.map(async (root) => {
      const text = await readText(`${root}/package.json`);

      const manifest: unknown = JSON.parse(text);

      const fields: Record<string, unknown> =
        typeof manifest === 'object' && manifest !== null ? { ...manifest } : {};

      return {
        root,
        name: typeof fields['name'] === 'string' ? fields['name'] : '',
        isPrivate: fields['private'] === true,
      };
    }),
  );
}
