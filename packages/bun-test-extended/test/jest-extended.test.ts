import { expect, mock, test } from 'bun:test';

test('it matches empty strings, arrays, and objects with toBeEmpty', () => {
  expect([]).toBeEmpty();
  expect('').toBeEmpty();
  expect({}).toBeEmpty();
});

test('it matches null and undefined with toBeNil', () => {
  expect(null).toBeNil();
  expect(undefined).toBeNil();
  expect(0).not.toBeNil();
});

test('it matches a member of a list with toBeOneOf', () => {
  expect('b').toBeOneOf(['a', 'b', 'c']);
});

test('it accepts a custom predicate with toSatisfy', () => {
  expect(12).toSatisfy((n: number) => n % 2 === 0);
});

test('it identifies arrays with toBeArray', () => {
  expect([1, 2]).toBeArray();
});

test('it checks array length with toBeArrayOfSize', () => {
  expect([1, 2, 3]).toBeArrayOfSize(3);
});

test('it requires every listed member with toIncludeAllMembers', () => {
  expect([1, 2, 3, 4]).toIncludeAllMembers([2, 4]);
});

test('it compares arrays ignoring order with toIncludeSameMembers', () => {
  expect([3, 1, 2]).toIncludeSameMembers([1, 2, 3]);
});

test('it requires at least one listed member with toIncludeAnyMembers', () => {
  expect([1, 2, 3]).toIncludeAnyMembers([3, 99]);
});

test('it applies a predicate to every element with toSatisfyAll', () => {
  expect([2, 4, 6]).toSatisfyAll((n: number) => n % 2 === 0);
});

test('it applies a predicate to at least one element with toSatisfyAny', () => {
  expect([1, 2, 3]).toSatisfyAny((n: number) => n === 2);
});

test('it finds an object by subset with toPartiallyContain', () => {
  expect([
    { id: 1, name: 'x' },
    { id: 2, name: 'y' },
  ]).toPartiallyContain({ id: 2 });
});

test('it matches every subset against some element with toIncludeAllPartialMembers', () => {
  expect([
    { id: 1, name: 'x' },
    { id: 2, name: 'y' },
  ]).toIncludeAllPartialMembers([{ id: 1 }]);
});

test('it identifies strings with toBeString', () => {
  expect('hi').toBeString();
});

test('it checks string prefixes with toStartWith', () => {
  expect('hello world').toStartWith('hello');
});

test('it checks string suffixes with toEndWith', () => {
  expect('hello world').toEndWith('world');
});

test('it checks substrings with toInclude', () => {
  expect('hello world').toInclude('lo wo');
});

test('it counts substring occurrences with toIncludeRepeated', () => {
  expect('ha ha ha').toIncludeRepeated('ha', 3);
});

test('it compares strings ignoring case with toEqualCaseInsensitive', () => {
  expect('Hello').toEqualCaseInsensitive('hELLO');
});

test('it compares strings ignoring whitespace with toEqualIgnoringWhitespace', () => {
  expect('a  b\n c').toEqualIgnoringWhitespace('a b c');
});

test('it identifies numbers with toBeNumber', () => {
  expect(1.5).toBeNumber();
});

test('it identifies integers with toBeInteger', () => {
  expect(3).toBeInteger();
  expect(3.5).not.toBeInteger();
});

test('it checks sign with toBePositive and toBeNegative', () => {
  expect(5).toBePositive();
  expect(-5).toBeNegative();
});

test('it checks numeric ranges with toBeWithin', () => {
  expect(7).toBeWithin(1, 10);
});

test('it checks parity with toBeEven and toBeOdd', () => {
  expect(4).toBeEven();
  expect(5).toBeOdd();
});

test('it identifies finite numbers with toBeFinite', () => {
  expect(1).toBeFinite();
  expect(Infinity).not.toBeFinite();
});

test('it identifies booleans with toBeBoolean, toBeTrue, and toBeFalse', () => {
  expect(true).toBeBoolean();
  expect(true).toBeTrue();
  expect(false).toBeFalse();
});

test('it identifies plain objects with toBeObject', () => {
  expect({ id: 1, name: 'x', tags: ['a'] }).toBeObject();
});

test('it checks keys with toContainKey, toContainAllKeys, and toContainAnyKeys', () => {
  const target: Record<string, unknown> = { id: 1, name: 'x', tags: ['a'] };

  expect(target).toContainKey('id');
  expect(target).toContainAllKeys(['id', 'name', 'tags']);
  expect(target).toContainAnyKeys(['name', 'missing']);
});

test('it checks values with toContainValue and toContainValues', () => {
  const target: Record<string, unknown> = { id: 1, name: 'x', tags: ['a'] };

  expect(target).toContainValue('x');
  expect(target).toContainValues([1, 'x']);
});

test('it checks entries with toContainEntry and toContainEntries', () => {
  const target: Record<string, unknown> = { id: 1, name: 'x', tags: ['a'] };

  expect(target).toContainEntry(['id', 1]);

  expect(target).toContainEntries([
    ['id', 1],
    ['name', 'x'],
  ]);
});

test('it checks object state with toBeFrozen, toBeSealed, and toBeExtensible', () => {
  expect(Object.freeze({})).toBeFrozen();
  expect(Object.seal({})).toBeSealed();
  expect({}).toBeExtensible();
});

test('it identifies dates with toBeDate and toBeValidDate', () => {
  expect(new Date('2026-01-01')).toBeDate();
  expect(new Date('2026-01-01')).toBeValidDate();
  expect(new Date('nope')).not.toBeValidDate();
});

test('it orders dates with toBeAfter, toBeBefore, and toBeBetween', () => {
  expect(new Date('2026-06-01')).toBeAfter(new Date('2026-01-01'));
  expect(new Date('2026-01-01')).toBeBefore(new Date('2026-06-01'));
  expect(new Date('2026-03-01')).toBeBetween(new Date('2026-01-01'), new Date('2026-06-01'));
});

test('it identifies functions with toBeFunction', () => {
  expect(() => 1).toBeFunction();
});

test('it asserts on error type and message with toThrowWithMessage', () => {
  expect(() => {
    throw new TypeError('bad input');
  }).toThrowWithMessage(TypeError, 'bad input');
});

test('it awaits resolution with toResolve', async () => {
  await expect(Promise.resolve('ok')).toResolve();
});

test('it awaits rejection with toReject', async () => {
  await expect(Promise.reject(new Error('no'))).toReject();
});

test('it counts a single call with toHaveBeenCalledOnce', () => {
  const fn = mock(() => null);

  fn();
  expect(fn).toHaveBeenCalledOnce();
});

test('it checks the single call and its args with toHaveBeenCalledExactlyOnceWith', () => {
  const fn = mock((value: string) => value);

  fn('a');
  expect(fn).toHaveBeenCalledExactlyOnceWith('a');
});

test('it orders mock calls with toHaveBeenCalledBefore and toHaveBeenCalledAfter', () => {
  const first = mock(() => null);
  const second = mock(() => null);

  first();
  second();
  expect(first).toHaveBeenCalledBefore(second);
  expect(second).toHaveBeenCalledAfter(first);
});

test('it works asymmetrically inside toEqual', () => {
  expect({ status: 'active', count: 4 }).toEqual({
    status: expect.toBeOneOf(['active', 'inactive']),
    count: expect.toBeEven(),
  });
});
