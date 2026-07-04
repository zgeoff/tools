import { expect, test } from 'bun:test';
import { transform } from '../src/transform.ts';

test('it pads after a var block before a non-var statement and keeps consecutive vars glued', () => {
  const src = `function f() {\n  const x = 1;\n  const y = 2;\n  let z = 3;\n  doStuff(x, y, z);\n}\n`;
  const { output, edits, parseError } = transform(src);

  expect(parseError).toBeNil();
  expect(edits).toBe(1);

  expect(output).toMatchInlineSnapshot(`
    "function f() {
      const x = 1;
      const y = 2;
      let z = 3;

      doStuff(x, y, z);
    }
    "
  `);
});

test('it pads before a return statement', () => {
  const src = `function f() {\n  doFirst();\n  return 1;\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "function f() {
      doFirst();

      return 1;
    }
    "
  `);
});

test('it pads both sides of a control-flow block', () => {
  const src = `function f(xs) {\n  setup();\n  if (ready) {\n    go();\n  }\n  cleanup();\n  for (const x of xs) {\n    use(x);\n  }\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "function f(xs) {
      setup();

      if (ready) {
        go();
      }

      cleanup();

      for (const x of xs) {
        use(x);
      }
    }
    "
  `);
});

test('it pads after bare function and class declarations', () => {
  const src = `function afterFnDecl() {}\nafterFnDecl();\nclass Thing {}\nnew Thing();\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "function afterFnDecl() {}

    afterFnDecl();
    class Thing {}

    new Thing();
    "
  `);
});

test('it pads after a bare var declaration at the top level', () => {
  const src = `const A = 1;\ndoA();\n`;
  const { output } = transform(src);

  expect(output).toBe('const A = 1;\n\ndoA();\n');
});

test('it does not pad after exported declarations (ESLint does not look through export)', () => {
  const src = `export const A = 1;\ndoA();\nexport function f() {}\ndoF();\nexport class C {}\ndoC();\n`;
  const { output, edits } = transform(src);

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it does not treat await using as a var declaration', () => {
  const src = `async function f() {\n  await using handle = acquire();\n  process(handle);\n}\n`;
  const { output, edits } = transform(src);

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it inserts a blank line between adjacent class members', () => {
  const src = `class C {\n  a = 1;\n  b = 2;\n  m() {}\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "class C {
      a = 1;

      b = 2;

      m() {}
    }
    "
  `);
});

test('it pads every member kind in a mixed class body', () => {
  const src = `class Mixed {\n  private a = 1;\n  constructor() {\n    this.a = 10;\n  }\n  method() {\n    return this.a;\n  }\n  get accessor() {\n    return this.a;\n  }\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "class Mixed {
      private a = 1;

      constructor() {
        this.a = 10;
      }

      method() {
        return this.a;
      }

      get accessor() {
        return this.a;
      }
    }
    "
  `);
});

test('it preserves indentation when inserting a blank line in a class body', () => {
  const src = `class C {\n    a = 1;\n    b = 2;\n}\n`;
  const { output } = transform(src);

  expect(output).toInclude('    a = 1;\n\n    b = 2;');
});

test('it pads inside switch cases, both braced and bare', () => {
  const src = `function f(n) {\n  switch (n) {\n    case 1: {\n      const a = 1;\n      return a;\n    }\n    case 2:\n      const b = 2;\n      return b;\n  }\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "function f(n) {
      switch (n) {
        case 1: {
          const a = 1;

          return a;
        }
        case 2:
          const b = 2;

          return b;
      }
    }
    "
  `);
});

test('it pads both sides of a multiline statement', () => {
  const src = `function f() {\n  doFirst();\n  callWith(\n    argOne,\n    argTwo,\n  );\n  doLast();\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "function f() {
      doFirst();

      callWith(
        argOne,
        argTwo,
      );

      doLast();
    }
    "
  `);
});

test('it separates a multiline declaration from an adjacent single-line one', () => {
  const src = `function f() {\n  const a = build(\n    partOne,\n    partTwo,\n  );\n  const b = build(partOne, partTwo);\n  use(a, b);\n}\n`;
  const { output } = transform(src);

  expect(output).toInclude('  );\n\n  const b = build(partOne, partTwo);');
});

test('it keeps adjacent single-line statements of the same kind tight', () => {
  const src = `function f() {\n  doFirst();\n  doSecond();\n}\n`;
  const { output, edits } = transform(src);

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it pads the boundary between a call statement and an assignment', () => {
  const src = `function f(edits) {\n  let tail = 0;\n  for (const e of edits) {\n    push(e.end, tail);\n    tail = e.start;\n  }\n}\n`;
  const { output } = transform(src);

  expect(output).toInclude('    push(e.end, tail);\n\n    tail = e.start;');
});

test('it keeps runs of assignments and increments glued', () => {
  const src = `function f() {\n  let x = 0;\n  let y = 0;\n  x = 1;\n  y = 2;\n  x++;\n  y--;\n}\n`;
  const { output } = transform(src);

  expect(output).toInclude('  x = 1;\n  y = 2;\n  x++;\n  y--;');
});

test('it keeps a trailing same-line line comment attached to the preceding var', () => {
  const src = `function f() {\n  const TIMEOUT_MS = 5000; // five seconds\n  doStuff(TIMEOUT_MS);\n}\n`;
  const { output } = transform(src);

  expect(output).toInclude('  const TIMEOUT_MS = 5000; // five seconds\n\n  doStuff(TIMEOUT_MS);');
});

test('it keeps a trailing block comment attached to the preceding var', () => {
  const src = `function f() {\n  const X = 1; /* note */\n  return X;\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "function f() {
      const X = 1; /* note */

      return X;
    }
    "
  `);
});

test('it puts the blank line before a leading comment that belongs to the next statement', () => {
  const src = `function f() {\n  const x = 1;\n  // explains the next line\n  return x;\n}\n`;
  const { output } = transform(src);

  expect(output).toMatchInlineSnapshot(`
    "function f() {
      const x = 1;

      // explains the next line
      return x;
    }
    "
  `);
});
