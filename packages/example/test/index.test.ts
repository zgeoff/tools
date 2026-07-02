import { expect, test } from 'bun:test';
import { greet } from '../src/index.ts';

test('greets by name', () => {
  expect(greet('world')).toBe('Hello, world!');
});
