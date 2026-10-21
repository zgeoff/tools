// oxlint-disable max-classes-per-file -- setup-test-only bans a module-level class, so each class-instance test declares its own
import { expect, test } from 'bun:test';
import { isRecord } from './is-record.ts';
import { mergeDeep } from './merge-deep.ts';

interface Settings {
  readonly theme: { readonly color: string; readonly size: number };
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly note: string | undefined;
}

test('it merges a nested object key by key', () => {
  const base: Settings = {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };

  const merged = mergeDeep(base, { theme: { size: 14 } });

  expect(merged.theme).toStrictEqual({ color: 'teal', size: 14 });
});

test('it replaces an array whole', () => {
  const base: Settings = {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };

  const merged = mergeDeep(base, { tags: ['garden'] });

  expect(merged.tags).toStrictEqual(['garden']);
});

test('it replaces a Date whole', () => {
  const base: Settings = {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };

  const merged = mergeDeep(base, { createdAt: new Date('2026-06-01') });

  expect(merged.createdAt).toStrictEqual(new Date('2026-06-01'));
});

test('it sets a key to undefined when the type admits undefined', () => {
  const base: Settings = {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };

  const merged = mergeDeep(base, { note: undefined });

  expect(merged.note).toBeUndefined();
});

test('it keeps every key the patch leaves out', () => {
  const base: Settings = {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };

  const merged = mergeDeep(base, {});

  expect(merged).toStrictEqual({
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  });
});

test('it leaves the base and the patch untouched', () => {
  const base: Settings = {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };

  const patch = { theme: { size: 14 } };

  mergeDeep(base, patch);

  expect({ base, patch }).toStrictEqual({
    base: {
      theme: { color: 'teal', size: 12 },
      tags: ['work', 'home'],
      createdAt: new Date('2026-01-01'),
      note: 'draft',
    },
    patch: { theme: { size: 14 } },
  });
});

test('it merges a symbol key', () => {
  const marker = Symbol('marker');

  const base: { [marker]: { readonly seen: boolean; readonly count: number } } = {
    [marker]: { seen: false, count: 1 },
  };

  const merged = mergeDeep(base, { [marker]: { seen: true } });

  expect(merged[marker]).toStrictEqual({ seen: true, count: 1 });
});

test('it refuses an explicit undefined for a key whose type lacks it', () => {
  const base: Settings = {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };

  // @ts-expect-error -- `theme` does not admit undefined
  const merged = mergeDeep(base, { theme: undefined });

  expect(merged.theme).toBeUndefined();
});

test('it keeps a __proto__ key of the patch as an own key and leaves the prototype alone', () => {
  const patch: unknown = JSON.parse('{"__proto__":{"isAdmin":true}}');

  if (!isRecord(patch)) {
    throw new Error('the patch is not a record');
  }

  const merged = mergeDeep<Record<string, unknown>>({}, patch);
  const prototype: unknown = Object.getPrototypeOf(merged);
  const isAdmin: unknown = Reflect.get(merged, 'isAdmin');
  const ownProto: unknown = Object.getOwnPropertyDescriptor(merged, '__proto__')?.value;

  expect({ prototype, isAdmin, ownProto }).toStrictEqual({
    prototype: Object.prototype,
    isAdmin: undefined,
    ownProto: { isAdmin: true },
  });
});

test('it replaces an array at the root whole', () => {
  expect(mergeDeep([1, 2], [3])).toStrictEqual([3]);
});

test('it replaces a Date at the root whole', () => {
  const merged = mergeDeep(new Date('2026-01-01'), new Date('2026-06-01'));

  expect(merged).toStrictEqual(new Date('2026-06-01'));
});

interface Toolbox {
  readonly format: (value: number) => string;
  readonly pattern: RegExp;
  readonly owners: ReadonlyMap<string, { readonly name: string; readonly city: string }>;
  readonly labels: ReadonlySet<string>;
  readonly ready: Promise<number>;
}

test('it replaces a function, a RegExp, a Map, a Set and a Promise whole', () => {
  const toolbox: Toolbox = {
    format: (value) => value.toFixed(1),
    pattern: /^tool-/u,
    owners: new Map([['wrench', { name: 'Ada', city: 'Hobart' }]]),
    labels: new Set(['steel']),
    ready: Promise.resolve(1),
  };

  const format = String;
  const pattern = /^kit-/u;

  const owners = new Map([['hammer', { name: 'Lin', city: 'Perth' }]]);
  const labels = new Set(['brass']);

  const ready = Promise.resolve(2);
  const merged = mergeDeep(toolbox, { format, pattern, owners, labels, ready });

  expect(merged).toStrictEqual({ format, pattern, owners, labels, ready });
});

test('it types a function, a RegExp, a Map, a Set and a Promise patch as the whole value', () => {
  const toolbox: Toolbox = {
    format: (value) => value.toFixed(1),
    pattern: /^tool-/u,
    owners: new Map([['wrench', { name: 'Ada', city: 'Hobart' }]]),
    labels: new Set(['steel']),
    ready: Promise.resolve(1),
  };

  // @ts-expect-error -- a Map patch is a whole Map, not a partial of one
  const mapPatch = mergeDeep(toolbox, { owners: { size: 1 } });

  // @ts-expect-error -- a RegExp patch is a whole RegExp, not a partial of one
  const patternPatch = mergeDeep(toolbox, { pattern: { source: 'x' } });

  // @ts-expect-error -- a Set patch is a whole Set, not a partial of one
  const setPatch = mergeDeep(toolbox, { labels: { size: 1 } });

  // @ts-expect-error -- a Promise patch is a whole Promise, not a partial of one
  const promisePatch = mergeDeep(toolbox, { ready: { catch: undefined } });

  // @ts-expect-error -- a function patch is a whole function, not a partial of one
  const formatPatch = mergeDeep(toolbox, { format: { length: 1 } });

  expect([mapPatch, patternPatch, setPatch, promisePatch, formatPatch]).toHaveLength(5);
});

test('it merges a class instance at the root key by key and keeps its prototype', () => {
  // oxlint-disable-next-line zgeoff/no-class -- the merge must keep a class instance's fields and prototype
  class Kettle {
    color = 'teal';

    size = 12;
  }

  const merged = mergeDeep(new Kettle(), { size: 14 });

  expect({
    isKettle: merged instanceof Kettle,
    color: merged.color,
    size: merged.size,
  }).toStrictEqual({ isKettle: true, color: 'teal', size: 14 });
});

test('it merges a nested class instance key by key', () => {
  // oxlint-disable-next-line zgeoff/no-class -- the merge must keep a class instance's fields and prototype
  class Kettle {
    color = 'teal';

    size = 12;
  }

  const merged = mergeDeep<{ kettle: Kettle }>(
    { kettle: new Kettle() },
    { kettle: { color: 'red' } },
  );

  expect({
    isKettle: merged.kettle instanceof Kettle,
    color: merged.kettle.color,
    size: merged.kettle.size,
  }).toStrictEqual({ isKettle: true, color: 'red', size: 12 });
});
