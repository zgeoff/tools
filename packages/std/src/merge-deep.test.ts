import { expect, test } from 'bun:test';
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
