import type { WorkspacePackage } from './types.ts';

// Reads the name and `private` flag of the package.json of each workspace folder.
export async function readWorkspacePackages(
  roots: readonly string[],
  readText: (path: string) => Promise<string>,
): Promise<WorkspacePackage[]> {
  return await Promise.all(
    roots.map(async (root) => {
      const text = await readText(`${root}/package.json`);

      const manifest: unknown = JSON.parse(text);

      const name =
        typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'name') : '';

      const isPrivate =
        typeof manifest === 'object' &&
        manifest !== null &&
        Reflect.get(manifest, 'private') === true;

      return { root, name: typeof name === 'string' ? name : '', isPrivate };
    }),
  );
}
