import { mock } from 'bun:test';
import { readdir } from 'node:fs/promises';

// A stand-in for a command that lists the folder's entries, sorted, as it starts, then exits 0, so a
// test learns what the folder held when each command started.
export function createListingStubKit(directory: string) {
  const listings: (readonly string[])[] = [];

  const stub = mock<(...callArguments: readonly unknown[]) => Promise<number>>(async () => {
    const entries = await readdir(directory);

    listings.push(entries.toSorted());

    return 0;
  });

  return { stub, listings };
}
