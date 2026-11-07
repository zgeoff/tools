import type { SyncEntry } from './parse-sync-entries.ts';

export function collectNeededNames(
  manifest: readonly SyncEntry[],
  requested: readonly SyncEntry[],
  skip: readonly string[],
): Set<string> {
  const taken = new Set<string>();

  const waiting = [...requested];

  for (let entry = waiting.shift(); entry !== undefined; entry = waiting.shift()) {
    if (taken.has(entry.name)) {
      continue;
    }

    taken.add(entry.name);

    const needs = entry.needs;

    waiting.push(
      ...manifest.filter((needed) => needs.includes(needed.name) && !skip.includes(needed.name)),
    );
  }

  return taken;
}
