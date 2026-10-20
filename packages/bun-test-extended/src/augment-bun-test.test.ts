import { expect, test } from 'bun:test';

interface Parcel {
  readonly id: string;
  readonly weight: number;
  readonly tags: readonly string[];
  readonly sender: { readonly name: string; readonly city: string };
  readonly note: string | null;
}

function buildParcel(): Parcel {
  return {
    id: 'parcel-12',
    weight: 2.5,
    tags: ['fragile', 'express'],
    sender: { name: 'Ada', city: 'Hobart' },
    note: 'leave at the door',
  };
}

test('it matches a property with expect.any inside toStrictEqual', () => {
  expect({ id: 'parcel-12' }).toStrictEqual({ id: expect.any(String) });
});

test('it matches every core asymmetric matcher inside toStrictEqual', () => {
  expect(buildParcel()).toStrictEqual({
    id: expect.stringMatching(/^parcel-\d+$/u),
    weight: expect.any(Number),
    tags: expect.arrayContaining(['express']),
    sender: expect.objectContaining({ city: 'Hobart' }),
    note: expect.stringContaining('door'),
  });
});

test('it matches a present value with expect.anything', () => {
  expect({ note: 'leave at the door' }).toStrictEqual({ note: expect.anything() });
});

test('it types each core asymmetric matcher as never', () => {
  const matchers: never[] = [
    expect.any(String),
    expect.anything(),
    expect.arrayContaining(['express']),
    expect.objectContaining({ city: 'Hobart' }),
    expect.stringContaining('door'),
    expect.stringMatching(/door/u),
  ];

  expect(matchers).toHaveLength(6);
});
