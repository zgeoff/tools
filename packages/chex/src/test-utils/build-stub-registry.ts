import type { ReadRegistry } from '../dependency-gates/read-publish-times.ts';

// Stands in for the npm registry: it answers a package URL with a packument that holds the given
// publish times (an ISO time by version), answers 404 for a package it holds none of, and records
// each URL it was asked for.
export function buildStubRegistry(
  packages: Readonly<Record<string, Readonly<Record<string, string>>>>,
): { readonly readRegistry: ReadRegistry; readonly requested: string[] } {
  const requested: string[] = [];

  const readRegistry: ReadRegistry = (url) => {
    requested.push(url);

    const name = decodeURIComponent(url.replace('https://registry.npmjs.org/', ''));
    const time = packages[name];

    return Promise.resolve({
      ok: time !== undefined,
      status: time === undefined ? 404 : 200,
      json: () => Promise.resolve({ name, time }),
    });
  };

  return { readRegistry, requested };
}
