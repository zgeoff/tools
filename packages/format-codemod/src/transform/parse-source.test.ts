import { expect, test } from 'bun:test';
import { parseSource } from './parse-source.ts';

test('it returns a program with node offsets for valid TypeScript', () => {
  const parsed = parseSource('const a = 1;\n', 'file.ts');

  expect(typeof parsed).not.toBe('string');

  expect(parsed).toMatchObject({
    program: { type: 'Program', body: [expect.objectContaining({ start: 0, end: 12 })] },
  });
});

test('it surfaces comment spans alongside the program', () => {
  const parsed = parseSource('const a = 1; // note\n', 'file.ts');

  expect(parsed).toMatchObject({ comments: [{ start: 13, end: 20 }] });
});

test('it returns the first error message when the source cannot parse', () => {
  const parsed = parseSource('const = (((\n', 'file.ts');

  expect(parsed).toBeString();
  expect(parsed).toInclude('Unexpected token');
});

test('it parses old-style type assertions when the filename says .ts', () => {
  const parsed = parseSource('const x = <string>v;\n', 'file.ts');

  expect(typeof parsed).not.toBe('string');
});

test('it parses JSX when the filename says .tsx', () => {
  const parsed = parseSource('const el = <div>hi</div>;\n', 'file.tsx');

  expect(typeof parsed).not.toBe('string');
});

test('it rejects JSX in a plain .ts file', () => {
  const parsed = parseSource('const el = <div>hi</div>;\n', 'file.ts');

  expect(parsed).toBeString();
});
