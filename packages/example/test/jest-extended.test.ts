import { expect, mock, test } from 'bun:test';

test('toBeEmpty', () => {
  expect([]).toBeEmpty();
  expect('').toBeEmpty();
  expect({}).toBeEmpty();
});

test('toBeNil', () => {
  expect(null).toBeNil();
  expect(undefined).toBeNil();
  expect(0).not.toBeNil();
});

test('toBeOneOf', () => {
  expect('b').toBeOneOf(['a', 'b', 'c']);
});

test('toSatisfy', () => {
  expect(12).toSatisfy((n: number) => n % 2 === 0);
});

test('toBeArray', () => {
  expect([1, 2]).toBeArray();
});

test('toBeArrayOfSize', () => {
  expect([1, 2, 3]).toBeArrayOfSize(3);
});

test('toIncludeAllMembers', () => {
  expect([1, 2, 3, 4]).toIncludeAllMembers([2, 4]);
});

test('toIncludeSameMembers', () => {
  expect([3, 1, 2]).toIncludeSameMembers([1, 2, 3]);
});

test('toIncludeAnyMembers', () => {
  expect([1, 2, 3]).toIncludeAnyMembers([3, 99]);
});

test('toSatisfyAll', () => {
  expect([2, 4, 6]).toSatisfyAll((n: number) => n % 2 === 0);
});

test('toSatisfyAny', () => {
  expect([1, 2, 3]).toSatisfyAny((n: number) => n === 2);
});

test('toPartiallyContain', () => {
  expect([
    { id: 1, name: 'x' },
    { id: 2, name: 'y' },
  ]).toPartiallyContain({ id: 2 });
});

test('toIncludeAllPartialMembers', () => {
  expect([
    { id: 1, name: 'x' },
    { id: 2, name: 'y' },
  ]).toIncludeAllPartialMembers([{ id: 1 }]);
});

test('toBeString', () => {
  expect('hi').toBeString();
});

test('toStartWith', () => {
  expect('hello world').toStartWith('hello');
});

test('toEndWith', () => {
  expect('hello world').toEndWith('world');
});

test('toInclude', () => {
  expect('hello world').toInclude('lo wo');
});

test('toIncludeRepeated', () => {
  expect('ha ha ha').toIncludeRepeated('ha', 3);
});

test('toEqualCaseInsensitive', () => {
  expect('Hello').toEqualCaseInsensitive('hELLO');
});

test('toEqualIgnoringWhitespace', () => {
  expect('a  b\n c').toEqualIgnoringWhitespace('a b c');
});

test('toBeNumber', () => {
  expect(1.5).toBeNumber();
});

test('toBeInteger', () => {
  expect(3).toBeInteger();
  expect(3.5).not.toBeInteger();
});

test('toBePositive / toBeNegative', () => {
  expect(5).toBePositive();
  expect(-5).toBeNegative();
});

test('toBeWithin', () => {
  expect(7).toBeWithin(1, 10);
});

test('toBeEven / toBeOdd', () => {
  expect(4).toBeEven();
  expect(5).toBeOdd();
});

test('toBeFinite', () => {
  expect(1).toBeFinite();
  expect(Infinity).not.toBeFinite();
});

test('toBeBoolean / toBeTrue / toBeFalse', () => {
  expect(true).toBeBoolean();
  expect(true).toBeTrue();
  expect(false).toBeFalse();
});

const target: Record<string, unknown> = { id: 1, name: 'x', tags: ['a'] };

test('toBeObject', () => {
  expect(target).toBeObject();
});

test('toContainKey / toContainAllKeys / toContainAnyKeys', () => {
  expect(target).toContainKey('id');
  expect(target).toContainAllKeys(['id', 'name', 'tags']);
  expect(target).toContainAnyKeys(['name', 'missing']);
});

test('toContainValue / toContainValues', () => {
  expect(target).toContainValue('x');
  expect(target).toContainValues([1, 'x']);
});

test('toContainEntry / toContainEntries', () => {
  expect(target).toContainEntry(['id', 1]);
  expect(target).toContainEntries([
    ['id', 1],
    ['name', 'x'],
  ]);
});

test('toBeFrozen / toBeSealed / toBeExtensible', () => {
  expect(Object.freeze({})).toBeFrozen();
  expect(Object.seal({})).toBeSealed();
  expect({}).toBeExtensible();
});

const early = new Date('2026-01-01');
const late = new Date('2026-06-01');

test('toBeDate / toBeValidDate', () => {
  expect(early).toBeDate();
  expect(early).toBeValidDate();
  expect(new Date('nope')).not.toBeValidDate();
});

test('toBeAfter / toBeBefore / toBeBetween', () => {
  expect(late).toBeAfter(early);
  expect(early).toBeBefore(late);
  expect(new Date('2026-03-01')).toBeBetween(early, late);
});

test('toBeFunction', () => {
  expect(() => 1).toBeFunction();
});

test('toThrowWithMessage', () => {
  expect(() => {
    throw new TypeError('bad input');
  }).toThrowWithMessage(TypeError, 'bad input');
});

test('toResolve', async () => {
  await expect(Promise.resolve('ok')).toResolve();
});

test('toReject', async () => {
  await expect(Promise.reject(new Error('no'))).toReject();
});

test('toHaveBeenCalledOnce', () => {
  const fn = mock(() => null);

  fn();
  expect(fn).toHaveBeenCalledOnce();
});

test('toHaveBeenCalledExactlyOnceWith', () => {
  const fn = mock((value: string) => value);

  fn('a');
  expect(fn).toHaveBeenCalledExactlyOnceWith('a');
});

test('toHaveBeenCalledBefore / toHaveBeenCalledAfter', () => {
  const first = mock(() => null);
  const second = mock(() => null);

  first();
  second();
  expect(first).toHaveBeenCalledBefore(second);
  expect(second).toHaveBeenCalledAfter(first);
});

test('matchers work inside toEqual', () => {
  expect({ status: 'active', count: 4 }).toEqual({
    status: expect.toBeOneOf(['active', 'inactive']),
    count: expect.toBeEven(),
  });
});
