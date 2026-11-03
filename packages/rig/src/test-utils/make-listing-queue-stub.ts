import { mock } from 'bun:test';

// A folder reader that answers each read with the next listing, and fails a read past the last
// one, so a test that reads more often than it planned fails instead of reading an empty folder.
export function makeListingQueueStub(listings: readonly (readonly string[])[]) {
  const answers = { readCount: 0 };

  return mock((path: string): Promise<readonly string[]> => {
    const listing = listings[answers.readCount];

    answers.readCount += 1;

    if (listing === undefined) {
      return Promise.reject(
        new Error(`an unexpected read of ${path}, after the ${listings.length} planned reads`),
      );
    }

    return Promise.resolve(listing);
  });
}
