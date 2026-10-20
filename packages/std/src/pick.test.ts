import { expect, test } from 'bun:test';
import { pick } from './pick.ts';

interface Kettle {
  readonly volume: number;
  readonly color: string;
  readonly label?: string;
}

test('it copies only the listed keys', () => {
  const kettle: Kettle = { volume: 2, color: 'teal', label: 'office' };

  expect(pick(kettle, ['volume', 'label'])).toStrictEqual({ volume: 2, label: 'office' });
});

test('it leaves out a listed key the object lacks', () => {
  const kettle: Kettle = { volume: 2, color: 'teal' };
  const picked = pick(kettle, ['volume', 'label']);

  expect(Reflect.ownKeys(picked)).toStrictEqual(['volume']);
});

test('it returns a new object and leaves the input untouched', () => {
  const kettle: Kettle = { volume: 2, color: 'teal' };
  const picked = pick(kettle, ['volume']);

  expect(picked).not.toBe(kettle);
  expect(kettle).toStrictEqual({ volume: 2, color: 'teal' });
});

test('it types the copy as only the listed keys', () => {
  const kettle: Kettle = { volume: 2, color: 'teal' };
  const picked: Pick<Kettle, 'volume'> = pick(kettle, ['volume']);

  // @ts-expect-error -- `color` is not a listed key
  const color: unknown = pick(kettle, ['volume']).color;

  expect({ picked, color }).toStrictEqual({ picked: { volume: 2 }, color: undefined });
});

test('it refuses a key the type lacks', () => {
  const kettle: Kettle = { volume: 2, color: 'teal' };

  // @ts-expect-error -- Kettle has no `spout` key
  const picked = pick(kettle, ['spout']);

  expect(picked).toBeEmpty();
});
