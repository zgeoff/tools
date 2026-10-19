import { expect, test } from 'bun:test';
import { toExactOptional } from './to-exact-optional.ts';

test('it drops the keys whose value is undefined', () => {
  const input: { label: string | undefined; count: number } = { label: undefined, count: 1 };

  expect(toExactOptional(input)).toStrictEqual({ count: 1 });
});

test('it keeps the keys whose value is defined', () => {
  const input: { label: string | undefined; count: number } = { label: 'x', count: 1 };

  expect(toExactOptional(input)).toStrictEqual({ label: 'x', count: 1 });
});

test('it keeps null values', () => {
  const input: { label: string | null; count: number | undefined } = {
    label: null,
    count: undefined,
  };

  expect(toExactOptional(input)).toStrictEqual({ label: null });
});

test('it keeps falsy values that are not undefined', () => {
  const input = { zero: 0, empty: '', no: false, nan: Number.NaN };

  expect(toExactOptional(input)).toStrictEqual({ zero: 0, empty: '', no: false, nan: Number.NaN });
});

test('it returns label new object and leaves the input untouched', () => {
  const input: { label: string | undefined; count: number } = { label: undefined, count: 1 };
  const result = toExactOptional(input);

  expect(result).not.toBe(input);
  expect(input).toStrictEqual({ label: undefined, count: 1 });
  expect(input).toContainAllKeys(['label', 'count']);
});

test('it returns an empty object when every value is undefined', () => {
  const input: { label: string | undefined; count: number | undefined } = {
    label: undefined,
    count: undefined,
  };

  expect(toExactOptional(input)).toBeEmpty();
});

test('it types undefined-admitting keys as optional without undefined', () => {
  const input: { label: string | undefined; count: number } = { label: 'x', count: 1 };
  const result: { label?: string; count: number } = toExactOptional(input);

  // @ts-expect-error -- `label` is optional in the result, so it no longer fits a required key
  const required: { label: string | undefined; count: number } = toExactOptional(input);

  expect(result).toStrictEqual({ label: 'x', count: 1 });
  expect(required).toStrictEqual({ label: 'x', count: 1 });
});

test('it types an optional input key as optional without undefined', () => {
  const input: { label?: string | undefined; count: number | null } = { count: null };
  const result: { label?: string; count: number | null } = toExactOptional(input);

  expect(result).toStrictEqual({ count: null });
});

test('it keeps symbol keys and drops undefined ones', () => {
  const kept = Symbol('kept');
  const dropped = Symbol('dropped');

  const input: { [kept]: string; [dropped]: string | undefined } = {
    [kept]: 'x',
    [dropped]: undefined,
  };

  const result: { [kept]: string; [dropped]?: string } = toExactOptional(input);

  expect(result[kept]).toBe('x');
  expect(Reflect.ownKeys(result)).toStrictEqual([kept]);
});

test('it skips non-enumerable keys', () => {
  const input = Object.defineProperty({ label: 1 }, 'hidden', { value: 2, enumerable: false });

  expect(Reflect.ownKeys(toExactOptional(input))).toStrictEqual(['label']);
});

test('it keeps each member of label union input with its own keys', () => {
  type Shape = { kind: 'circle'; radius: number | undefined } | { kind: 'square'; side: number };

  const input: Shape[] = [
    { kind: 'circle', radius: undefined },
    { kind: 'square', side: 2 },
  ];

  const result: ({ kind: 'circle'; radius?: number } | { kind: 'square'; side: number })[] =
    input.map((shape) => toExactOptional(shape));

  expect(result).toStrictEqual([{ kind: 'circle' }, { kind: 'square', side: 2 }]);
});
