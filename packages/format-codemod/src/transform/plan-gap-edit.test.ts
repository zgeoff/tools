import { expect, test } from 'bun:test';
import { planGapEdit } from './plan-gap-edit.ts';

test('it plans a splice that widens a single-newline gap to one blank line', () => {
  const src = 'const a = 1;\nuse(a);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 13, end: 20 },
    pad: true,
  });

  expect(edit).toEqual({ start: 12, end: 13, replacement: '\n\n' });
});

test('it returns null when the gap already holds exactly one blank line', () => {
  const src = 'const a = 1;\n\nuse(a);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 14, end: 21 },
    pad: true,
  });

  expect(edit).toBeNil();
});

test('it preserves the next statement indentation in the replacement', () => {
  const src = '{\n  const a = 1;\n  use(a);\n}\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'VariableDeclaration', start: 4, end: 16 },
    next: { type: 'ExpressionStatement', start: 19, end: 26 },
    pad: true,
  });

  expect(edit).toEqual({ start: 16, end: 19, replacement: '\n\n  ' });
});

test('it returns null when the statements share a physical line', () => {
  const src = 'const a = 1; use(a);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 13, end: 20 },
    pad: true,
  });

  expect(edit).toBeNil();
});

test('it returns null when the gap holds anything besides whitespace and comments', () => {
  // a fabricated gap that swallows a stray token — must never be resized
  const src = 'const a = 1; @ \nuse(a);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 16, end: 23 },
    pad: true,
  });

  expect(edit).toBeNil();
});

test('it keeps a trailing same-line comment attached to the previous statement', () => {
  const src = 'const a = 1; // note\nuse(a);\n';

  const edit = planGapEdit({
    file: { src, comments: [{ start: 13, end: 20 }] },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 21, end: 28 },
    pad: true,
  });

  expect(edit).toEqual({ start: 20, end: 21, replacement: '\n\n' });
});

test('it keeps multiple same-line trailing comments together on the previous line', () => {
  const src = 'const a = 1; /* x */ /* y */\nuse(a);\n';

  const edit = planGapEdit({
    file: {
      src,
      comments: [
        { start: 13, end: 20 },
        { start: 21, end: 28 },
      ],
    },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 29, end: 36 },
    pad: true,
  });

  expect(edit).toEqual({ start: 28, end: 29, replacement: '\n\n' });
});

test('it puts the blank line before a leading comment of the next statement', () => {
  const src = 'const a = 1;\n// about use\nuse(a);\n';

  const edit = planGapEdit({
    file: { src, comments: [{ start: 13, end: 25 }] },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 26, end: 33 },
    pad: true,
  });

  expect(edit).toEqual({ start: 12, end: 13, replacement: '\n\n' });
});

test('it returns null when a leading comment is already preceded by a blank line', () => {
  const src = 'const a = 1;\n\n// about use\nuse(a);\n';

  const edit = planGapEdit({
    file: { src, comments: [{ start: 14, end: 26 }] },
    prev: { type: 'VariableDeclaration', start: 0, end: 12 },
    next: { type: 'ExpressionStatement', start: 27, end: 34 },
    pad: true,
  });

  expect(edit).toBeNil();
});

test('it plans a splice that collapses a one-blank-line gap to flush', () => {
  const src = 'use(a);\n\nuse(b);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'ExpressionStatement', start: 0, end: 7 },
    next: { type: 'ExpressionStatement', start: 9, end: 16 },
    pad: false,
  });

  expect(edit).toEqual({ start: 7, end: 9, replacement: '\n' });
});

test('it collapses several blank lines to flush in one splice', () => {
  const src = 'use(a);\n\n\n\nuse(b);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'ExpressionStatement', start: 0, end: 7 },
    next: { type: 'ExpressionStatement', start: 11, end: 18 },
    pad: false,
  });

  expect(edit).toEqual({ start: 7, end: 11, replacement: '\n' });
});

test('it preserves the next statement indentation when collapsing', () => {
  const src = '{\n  use(a);\n\n  use(b);\n}\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'ExpressionStatement', start: 4, end: 11 },
    next: { type: 'ExpressionStatement', start: 15, end: 22 },
    pad: false,
  });

  expect(edit).toEqual({ start: 11, end: 15, replacement: '\n  ' });
});

test('it returns null when a flush target is already flush', () => {
  const src = 'use(a);\nuse(b);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'ExpressionStatement', start: 0, end: 7 },
    next: { type: 'ExpressionStatement', start: 8, end: 15 },
    pad: false,
  });

  expect(edit).toBeNil();
});

test('it never collapses a gap that holds a comment', () => {
  const src = 'use(a);\n\n// group two\nuse(b);\n';

  const edit = planGapEdit({
    file: { src, comments: [{ start: 9, end: 21 }] },
    prev: { type: 'ExpressionStatement', start: 0, end: 7 },
    next: { type: 'ExpressionStatement', start: 22, end: 29 },
    pad: false,
  });

  expect(edit).toBeNil();
});

test('it never collapses a gap whose comment sits on the previous line', () => {
  const src = 'use(a); // note\n\nuse(b);\n';

  const edit = planGapEdit({
    file: { src, comments: [{ start: 8, end: 15 }] },
    prev: { type: 'ExpressionStatement', start: 0, end: 7 },
    next: { type: 'ExpressionStatement', start: 17, end: 24 },
    pad: false,
  });

  expect(edit).toBeNil();
});

test('it returns null when a flush target shares a physical line', () => {
  const src = 'use(a); use(b);\n';

  const edit = planGapEdit({
    file: { src, comments: [] },
    prev: { type: 'ExpressionStatement', start: 0, end: 7 },
    next: { type: 'ExpressionStatement', start: 8, end: 15 },
    pad: false,
  });

  expect(edit).toBeNil();
});
