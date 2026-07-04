import { expect, test } from 'bun:test';
import { planGapEdit } from '../src/transform/plan-gap-edit.ts';

test('it plans a splice that widens a single-newline gap to one blank line', () => {
  const src = 'const a = 1;\nuse(a);\n';
  const edit = planGapEdit(
    { src, comments: [] },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 13, end: 20 },
  );

  expect(edit).toEqual({ start: 12, end: 13, replacement: '\n\n' });
});

test('it returns null when the gap already holds exactly one blank line', () => {
  const src = 'const a = 1;\n\nuse(a);\n';
  const edit = planGapEdit(
    { src, comments: [] },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 14, end: 21 },
  );

  expect(edit).toBeNil();
});

test('it preserves the next statement indentation in the replacement', () => {
  const src = '{\n  const a = 1;\n  use(a);\n}\n';
  const edit = planGapEdit(
    { src, comments: [] },
    { type: 'VariableDeclaration', start: 4, end: 16 },
    { type: 'ExpressionStatement', start: 19, end: 26 },
  );

  expect(edit).toEqual({ start: 16, end: 19, replacement: '\n\n  ' });
});

test('it returns null when the statements share a physical line', () => {
  const src = 'const a = 1; use(a);\n';
  const edit = planGapEdit(
    { src, comments: [] },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 13, end: 20 },
  );

  expect(edit).toBeNil();
});

test('it returns null when the gap holds anything besides whitespace and comments', () => {
  // a fabricated gap that swallows a stray token — must never be resized
  const src = 'const a = 1; @ \nuse(a);\n';
  const edit = planGapEdit(
    { src, comments: [] },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 16, end: 23 },
  );

  expect(edit).toBeNil();
});

test('it keeps a trailing same-line comment attached to the previous statement', () => {
  const src = 'const a = 1; // note\nuse(a);\n';
  const edit = planGapEdit(
    { src, comments: [{ start: 13, end: 20 }] },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 21, end: 28 },
  );

  expect(edit).toEqual({ start: 20, end: 21, replacement: '\n\n' });
});

test('it keeps multiple same-line trailing comments together on the previous line', () => {
  const src = 'const a = 1; /* x */ /* y */\nuse(a);\n';
  const edit = planGapEdit(
    {
      src,
      comments: [
        { start: 13, end: 20 },
        { start: 21, end: 28 },
      ],
    },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 29, end: 36 },
  );

  expect(edit).toEqual({ start: 28, end: 29, replacement: '\n\n' });
});

test('it puts the blank line before a leading comment of the next statement', () => {
  const src = 'const a = 1;\n// about use\nuse(a);\n';
  const edit = planGapEdit(
    { src, comments: [{ start: 13, end: 25 }] },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 26, end: 33 },
  );

  expect(edit).toEqual({ start: 12, end: 13, replacement: '\n\n' });
});

test('it returns null when a leading comment is already preceded by a blank line', () => {
  const src = 'const a = 1;\n\n// about use\nuse(a);\n';
  const edit = planGapEdit(
    { src, comments: [{ start: 14, end: 26 }] },
    { type: 'VariableDeclaration', start: 0, end: 12 },
    { type: 'ExpressionStatement', start: 27, end: 34 },
  );

  expect(edit).toBeNil();
});
