import { isRecord } from '../../packages/std/src/is-record.ts';

// release-please gives a package with no manifest version its initial-version, which is the version
// a first publish by hand already took, so its first CI release would collide with it.
export function collectUnversionedPackages(config: unknown, manifest: unknown): readonly string[] {
  const packages = isRecord(config) && isRecord(config['packages']) ? config['packages'] : {};
  const versions = isRecord(manifest) ? manifest : {};

  return Object.keys(packages).filter((packagePath) => typeof versions[packagePath] !== 'string');
}
