export function hasBrowserBuildScript(manifest: unknown): boolean {
  if (typeof manifest !== 'object' || manifest === null || !('scripts' in manifest)) {
    return false;
  }

  const scripts = manifest.scripts;

  return (
    typeof scripts === 'object' &&
    scripts !== null &&
    'build:browser' in scripts &&
    typeof scripts['build:browser'] === 'string'
  );
}
