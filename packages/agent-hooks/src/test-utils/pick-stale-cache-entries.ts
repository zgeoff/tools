import { match } from 'ts-pattern';
import { parseCacheEntry } from './parse-cache-entry.ts';

export interface CacheListing {
  readonly name: string;

  readonly templateName: string;

  readonly entries: readonly string[];

  // The templates that a reader that still runs is copying or reading.
  readonly readTemplateNames: ReadonlySet<string>;
}

// The caller holds the cache's lock, so no other build runs, and every build folder is left over
// from a build that failed or died. A template stays while a reader uses it, with its readers.
export function pickStaleCacheEntries(listing: CacheListing): readonly string[] {
  return listing.entries.filter((entry) => {
    const cacheEntry = parseCacheEntry(listing.name, entry);

    if (cacheEntry === null) {
      return false;
    }

    return match(cacheEntry.kind)
      .with('build', () => true)
      .with(
        'template',
        'readers',
        () =>
          cacheEntry.templateName !== listing.templateName &&
          !listing.readTemplateNames.has(cacheEntry.templateName),
      )
      .exhaustive();
  });
}
