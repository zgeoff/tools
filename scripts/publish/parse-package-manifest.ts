// A private package never publishes, so it needs no version; only a public one's publish metadata
// is checked.
export type PackageManifest =
  | { readonly kind: 'private'; readonly folder: string; readonly name: string }
  | {
      readonly kind: 'public';
      readonly folder: string;
      readonly name: string;
      readonly version: string;
      readonly hasBuild: boolean;
      readonly releasedVersion: string | undefined;
    };

export function parsePackageManifest(
  text: string,
  folder: string,
  releasedVersion: string | undefined,
): PackageManifest {
  const manifest: unknown = JSON.parse(text);

  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`${folder}/package.json holds no JSON object`);
  }

  const name = 'name' in manifest ? manifest.name : undefined;

  if ('private' in manifest && manifest.private === true) {
    return { kind: 'private', folder, name: typeof name === 'string' ? name : folder };
  }

  const version = 'version' in manifest ? manifest.version : undefined;

  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new TypeError(`${folder}/package.json names no package and version`);
  }

  const scripts = 'scripts' in manifest ? manifest.scripts : undefined;

  return {
    kind: 'public',
    folder,
    name,
    version,
    hasBuild: typeof scripts === 'object' && scripts !== null && 'build' in scripts,
    releasedVersion,
  };
}
