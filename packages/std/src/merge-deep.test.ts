import { expect, test } from 'bun:test';
import { isRecord } from './is-record.ts';
import { mergeDeep } from './merge-deep.ts';

interface Settings {
  readonly theme: { readonly color: string; readonly size: number };
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly note: string | undefined;
}

function buildSettings(): Settings {
  return {
    theme: { color: 'teal', size: 12 },
    tags: ['work', 'home'],
    createdAt: new Date('2026-01-01'),
    note: 'draft',
  };
}

test('it merges a nested object key by key', () => {
  const merged = mergeDeep(buildSettings(), { theme: { size: 14 } });

  expect(merged.theme).toStrictEqual({ color: 'teal', size: 14 });
});

test('it replaces an array whole', () => {
  const merged = mergeDeep(buildSettings(), { tags: ['garden'] });

  expect(merged.tags).toStrictEqual(['garden']);
});

test('it replaces a Date whole', () => {
  const merged = mergeDeep(buildSettings(), { createdAt: new Date('2026-06-01') });

  expect(merged.createdAt).toStrictEqual(new Date('2026-06-01'));
});

test('it sets a key to undefined when the type admits undefined', () => {
  const merged = mergeDeep(buildSettings(), { note: undefined });

  expect(merged.note).toBeUndefined();
});

test('it keeps every key the patch leaves out', () => {
  const merged = mergeDeep(buildSettings(), {});

  expect(merged).toStrictEqual(buildSettings());
});

test('it leaves the base and the patch untouched', () => {
  const base = buildSettings();
  const patch = { theme: { size: 14 } };

  mergeDeep(base, patch);

  expect({ base, patch }).toStrictEqual({ base: buildSettings(), patch: { theme: { size: 14 } } });
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
  // @ts-expect-error -- `theme` does not admit undefined
  const merged = mergeDeep(buildSettings(), { theme: undefined });

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
