import { expect, test } from 'bun:test';
import type { Tagged } from 'type-fest';
import { toTagged } from './to-tagged.ts';

type OrderID = Tagged<string, 'OrderID'>;

type Quantity = Tagged<number, 'Quantity'>;

test('it returns the value it is given', () => {
  expect<string>(toTagged<OrderID>('order-7')).toBe('order-7');
});

test('it types a string as a tagged string', () => {
  const orderID: OrderID = toTagged<OrderID>('order-7');

  // @ts-expect-error -- a plain string is not an OrderID
  const untagged: OrderID = 'order-7';

  expect<string[]>([orderID, untagged]).toStrictEqual(['order-7', 'order-7']);
});

test('it types a number as a tagged number', () => {
  const quantity: Quantity = toTagged<Quantity>(3);

  expect<number>(quantity).toBe(3);
});

test('it refuses a value of another base type', () => {
  // @ts-expect-error -- an OrderID is made from a string
  const orderID: unknown = toTagged<OrderID>(7);

  expect(orderID).toBe(7);
});

test('it refuses a type that carries no tag', () => {
  // @ts-expect-error -- a literal union is not a tagged type
  const size = toTagged<'small' | 'large'>('medium');

  expect<string>(size).toBe('medium');
});
