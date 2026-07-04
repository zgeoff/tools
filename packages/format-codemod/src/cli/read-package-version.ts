import fs from 'node:fs';

/**
 * Reads the version field of the package manifest at the given path, throwing
 * when the file isn't a manifest. Callers own the path so it resolves against
 * their own location.
 */
export function readPackageVersion(pkgPath: string): string {
  const parsed: unknown = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (!isPackageJSON(parsed)) {
    throw new TypeError('Invalid package.json');
  }

  return parsed.version;
}

function isPackageJSON(value: unknown): value is { version: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string'
  );
}
