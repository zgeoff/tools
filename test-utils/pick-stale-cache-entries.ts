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
    if (!entry.startsWith(`${listing.name}-`)) {
      return false;
    }

    if (entry.includes('.building-')) {
      return true;
    }

    const templateName = entry.endsWith('.readers') ? entry.slice(0, -'.readers'.length) : entry;

    return templateName !== listing.templateName && !listing.readTemplateNames.has(templateName);
  });
}
