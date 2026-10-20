import { expect, test } from 'bun:test';
import { toReadonlyDeep } from './to-readonly-deep.ts';
import type { ReadonlyDeep } from './to-readonly-deep.ts';

interface Shelf {
  label: string;
  books: { title: string; tags: string[] }[];
  lent: Map<string, { due: Date }>;
}

function buildShelf(): Shelf {
  return {
    label: 'garden',
    books: [{ title: 'Ferns', tags: ['plants'] }],
    lent: new Map([['Mosses', { due: new Date('2026-02-01') }]]),
  };
}

test('it returns the same value', () => {
  const shelf = buildShelf();

  expect(toReadonlyDeep(shelf)).toBe(shelf);
});

test('it types every nested key as readonly', () => {
  const shelf: ReadonlyDeep<Shelf> = toReadonlyDeep(buildShelf());
  const [book] = shelf.books;

  // @ts-expect-error -- a nested array is readonly, so it does not fit a mutable one
  const tags: string[] = book?.tags ?? [];

  expect(tags).toStrictEqual(['plants']);
});

test('it types a nested key as unassignable', () => {
  const shelf = toReadonlyDeep(buildShelf());
  const [book] = shelf.books;

  if (book === undefined) {
    throw new Error('the shelf holds no book');
  }

  // @ts-expect-error -- a nested key is readonly
  book.title = 'Mosses';

  expect(book.title).toBe('Mosses');
});

test('it types a Map as a ReadonlyMap of readonly values', () => {
  const lent: ReadonlyMap<string, { readonly due: Date }> = toReadonlyDeep(buildShelf()).lent;

  // @ts-expect-error -- a ReadonlyMap has no `set`
  const set: unknown = toReadonlyDeep(buildShelf()).lent.set;

  expect({ size: lent.size, set }).toStrictEqual({ size: 1, set: expect.any(Function) });
});
