import { firstPartyScopes } from './first-party-scopes.ts';
import type { AgeGate } from './parse-age-gate.ts';
import type { LockfileRegistryPackage } from './parse-lockfile-registry-names.ts';
import { readPublishTimes } from './read-publish-times.ts';
import type { DependencyGateFinding } from './types.ts';

// Bun applies the gate when it resolves a version, not to one the lockfile already pins, so a
// lockfile written under an exclude keeps a young release after the exclude goes.
export interface YoungLockedReleaseSources {
  readonly ageGate: AgeGate;
  readonly packages: readonly LockfileRegistryPackage[];
  readonly nowMs: number;
}

export async function readYoungLockedReleases(
  options: Readonly<YoungLockedReleaseSources>,
): Promise<DependencyGateFinding[]> {
  if (!options.ageGate.isOn) {
    return [];
  }

  const checked = options.packages.filter(
    (entry) =>
      !firstPartyScopes.some((scope) => entry.name.startsWith(scope)) &&
      !options.ageGate.excludes.includes(entry.name) &&
      !options.ageGate.excludes.includes(`${entry.name}@${entry.version}`),
  );

  const times = await readPublishTimes([...new Set(checked.map((entry) => entry.name))]);

  return checked.flatMap((entry) => {
    const name = entry.name;
    const version = entry.version;
    const publishedMs = times.get(name)?.get(version);

    if (publishedMs === undefined) {
      throw new Error(`the registry lists no publish time for ${name}@${version}`);
    }

    if (options.nowMs - publishedMs >= options.ageGate.seconds * 1000) {
      return [];
    }

    return [
      {
        path: 'bun.lock',
        entry: `${name}@${version}`,
        problem: `bun.lock pins a release published ${new Date(publishedMs).toISOString()}, younger than the ${options.ageGate.seconds} second minimumReleaseAge, and no age-gate exclude covers it`,
      },
    ];
  });
}
