import fs from 'node:fs';

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
