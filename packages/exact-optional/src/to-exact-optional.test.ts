import { expect, test } from 'bun:test';
import { toExactOptional } from './to-exact-optional.ts';

test('it drops the keys whose value is undefined', () => {
  const input: { a: string | undefined; b: number } = { a: undefined, b: 1 };

  expect(toExactOptional(input)).toStrictEqual({ b: 1 });
});

test('it keeps the keys whose value is defined', () => {
  const input: { a: string | undefined; b: number } = { a: 'x', b: 1 };

  expect(toExactOptional(input)).toStrictEqual({ a: 'x', b: 1 });
});

test('it keeps null values', () => {
  const input: { a: string | null; b: number | undefined } = { a: null, b: undefined };

  expect(toExactOptional(input)).toStrictEqual({ a: null });
});

test('it keeps falsy values that are not undefined', () => {
  const input = { zero: 0, empty: '', no: false, nan: Number.NaN };

  expect(toExactOptional(input)).toStrictEqual({ zero: 0, empty: '', no: false, nan: Number.NaN });
});

test('it returns a new object and leaves the input untouched', () => {
  const input: { a: string | undefined; b: number } = { a: undefined, b: 1 };
  const result = toExactOptional(input);

  expect(result).not.toBe(input);
  expect(input).toStrictEqual({ a: undefined, b: 1 });
  expect(input).toContainAllKeys(['a', 'b']);
});

test('it returns an empty object when every value is undefined', () => {
  const input: { a: string | undefined; b: number | undefined } = { a: undefined, b: undefined };

  expect(toExactOptional(input)).toBeEmpty();
});

test('it types undefined-admitting keys as optional without undefined', () => {
  const input: { a: string | undefined; b: number } = { a: 'x', b: 1 };
  const result: { a?: string; b: number } = toExactOptional(input);

  // @ts-expect-error -- `a` is optional in the result, so it no longer fits a required key
  const required: { a: string | undefined; b: number } = toExactOptional(input);

  expect(result).toStrictEqual({ a: 'x', b: 1 });
  expect(required).toStrictEqual({ a: 'x', b: 1 });
});

test('it types an optional input key as optional without undefined', () => {
  const input: { a?: string | undefined; b: number | null } = { b: null };
  const result: { a?: string; b: number | null } = toExactOptional(input);

  expect(result).toStrictEqual({ b: null });
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
  const input = Object.defineProperty({ a: 1 }, 'hidden', { value: 2, enumerable: false });

  expect(Reflect.ownKeys(toExactOptional(input))).toStrictEqual(['a']);
});

test('it keeps each member of a union input with its own keys', () => {
  type Shape = { kind: 'circle'; radius: number | undefined } | { kind: 'square'; side: number };

  const input: Shape[] = [
    { kind: 'circle', radius: undefined },
    { kind: 'square', side: 2 },
  ];

  const result: ({ kind: 'circle'; radius?: number } | { kind: 'square'; side: number })[] =
    input.map((shape) => toExactOptional(shape));

  expect(result).toStrictEqual([{ kind: 'circle' }, { kind: 'square', side: 2 }]);
});
