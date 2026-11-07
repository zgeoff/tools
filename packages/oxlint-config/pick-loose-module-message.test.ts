import { expect, test } from 'bun:test';
import pickLooseModuleMessage from './pick-loose-module-message.js';

test.each<[string, readonly string[], string, 'capExample' | 'cap' | null]>([
  ['the first module over the cap', ['a.ts', 'b.ts', 'c.ts'], 'a.ts', 'capExample'],
  ['a later module over the cap', ['a.ts', 'b.ts', 'c.ts'], 'c.ts', 'cap'],
  ['a module at the cap', ['a.ts', 'b.ts'], 'a.ts', null],
  ['a file that is not counted', ['a.ts', 'b.ts', 'c.ts'], 'index.ts', null],
])('it picks the message for %s', (_, modules, name, expected) => {
  expect(pickLooseModuleMessage(modules, name, 2)).toBe(expected);
});
