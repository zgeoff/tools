import { expect, test } from 'bun:test';
import { makeListingQueueStub } from './make-listing-queue-stub.ts';

test('it answers each read with the next listing, in order', async () => {
  const readDirNames = makeListingQueueStub([['pending-tests'], ['5120', '6230']]);

  const first = await readDirNames('/runs/4417/groups');
  const second = await readDirNames('/runs/4417/groups');

  expect(first).toStrictEqual(['pending-tests']);
  expect(second).toStrictEqual(['5120', '6230']);
});

test('it fails a read past the last listing', async () => {
  const readDirNames = makeListingQueueStub([['5120']]);

  await readDirNames('/runs/4417/groups');

  const failure = await readDirNames('/runs/4417/groups').then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message: 'an unexpected read of /runs/4417/groups, after the 1 planned reads',
  });
});
