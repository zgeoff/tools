import { describe, expect, test } from 'bun:test';
import { greet } from '../src/index.ts';

describe('greet', () => {
  test('greets by name', () => {
    expect(greet('world')).toBe('Hello, world!');
  });
});
