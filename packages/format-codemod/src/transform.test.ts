import { expect, test } from 'bun:test';
import { transform } from './transform.ts';

test('it pads after a var block before a non-var statement and keeps consecutive vars glued', () => {
  const src = `function f() {\n  const x = 1;\n  const y = 2;\n  let z = 3;\n  doStuff(x, y, z);\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;
  const parseError = result.parseError;

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
  const output = transform(src).output;

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
  const output = transform(src).output;

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
  const output = transform(src).output;

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
  const output = transform(src).output;

  expect(output).toBe('const A = 1;\n\ndoA();\n');
});

test('it does not pad after exported declarations (ESLint does not look through export)', () => {
  const src = `export const A = 1;\ndoA();\nexport function f() {}\ndoF();\nexport class C {}\ndoC();\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it pads after a using block before a statement of another kind', () => {
  const src = `async function f() {\n  await using handle = acquire();\n  use(handle);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  await using handle = acquire();\n\n  use(handle);');
});

test('it keeps runs of same-flavour using declarations glued', () => {
  const src = `async function f() {\n  await using a = await acquireA();\n  await using b = await acquireB();\n  use(a, b);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude(
    '  await using a = await acquireA();\n  await using b = await acquireB();\n\n  use(a, b);',
  );
});

test('it pads the boundary between an await using and a plain using declaration', () => {
  const src = `async function f() {\n  await using a = await acquireA();\n  using b = acquireB();\n  use(a, b);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  await using a = await acquireA();\n\n  using b = acquireB();');
});

test('it pads the boundary between a using declaration and a const block', () => {
  const src = `async function f() {\n  using scope = createScope();\n  const a = build(scope);\n  use(a);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  using scope = createScope();\n\n  const a = build(scope);');
});

test('it pads the boundary between awaited and non-awaited declarations', () => {
  const src = `async function f(db) {\n  const viewer = await createViewer(db);\n  const admin = await createAdmin(db);\n  const client = buildClient(viewer);\n  const limits = buildLimits(client);\n  use(admin, limits);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude(
    '  const viewer = await createViewer(db);\n  const admin = await createAdmin(db);\n\n  const client = buildClient(viewer);\n  const limits = buildLimits(client);',
  );
});

test('it treats an await inside the head chain as awaited', () => {
  const src = `async function f(client) {\n  const profile = (await client.getProfile()).data;\n  const rest = await splitRecords(profile);\n  use(rest);\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(1);

  expect(output).toInclude(
    '  const profile = (await client.getProfile()).data;\n  const rest = await splitRecords(profile);',
  );
});

test('it treats await in argument position as non-awaited', () => {
  const src = `async function f(client) {\n  const label = buildLabel(await client.getSuffix());\n  const mode = pickMode(client);\n  use(label, mode);\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(1);

  expect(output).toInclude(
    '  const label = buildLabel(await client.getSuffix());\n  const mode = pickMode(client);',
  );
});

test('it pads the boundary between awaited and non-awaited call statements', () => {
  const src = `async function f(client, tracer) {\n  await client.warmCache();\n  await tracer.mark();\n  client.resetRetries();\n  tracer.stop();\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude(
    '  await client.warmCache();\n  await tracer.mark();\n\n  client.resetRetries();\n  tracer.stop();',
  );
});

test('it pads the boundary between awaited and non-awaited assignments', () => {
  const src = `async function f(client) {\n  let pending = null;\n  let retries = 0;\n  pending = client.ping();\n  retries += 1;\n  pending = await client.flush();\n  use(pending, retries);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude(
    '  pending = client.ping();\n  retries += 1;\n\n  pending = await client.flush();',
  );
});

test('it inserts a blank line between adjacent class members', () => {
  const src = `class C {\n  a = 1;\n  b = 2;\n  m() {}\n}\n`;
  const output = transform(src).output;

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
  const output = transform(src).output;

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
  const output = transform(src).output;

  expect(output).toInclude('    a = 1;\n\n    b = 2;');
});

test('it pads inside switch cases, both braced and bare', () => {
  const src = `function f(n) {\n  switch (n) {\n    case 1: {\n      const a = 1;\n      return a;\n    }\n    case 2:\n      const b = 2;\n      return b;\n  }\n}\n`;
  const output = transform(src).output;

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
  const output = transform(src).output;

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
  const output = transform(src).output;

  expect(output).toInclude('  );\n\n  const b = build(partOne, partTwo);');
});

test('it keeps adjacent single-line statements of the same kind tight', () => {
  const src = `function f() {\n  doFirst();\n  doSecond();\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it pads the boundary between a call statement and an assignment', () => {
  const src = `function f(edits) {\n  let tail = 0;\n  for (const e of edits) {\n    push(e.end, tail);\n    tail = e.start;\n  }\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('    push(e.end, tail);\n\n    tail = e.start;');
});

test('it pads the boundary between a call statement and a following declaration', () => {
  const src = `function f(file, src) {\n  writeFile(file, src);\n  const result = buildResult(src);\n  use(result);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  writeFile(file, src);\n\n  const result = buildResult(src);');
});

test('it pads the boundary between a mutation and a following declaration', () => {
  const src = `function f() {\n  let tail = 0;\n  tail = 1;\n  const next = tail;\n  use(next);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  tail = 1;\n\n  const next = tail;');
});

test('it keeps runs of assignments and increments glued', () => {
  const src = `function f() {\n  let x = 0;\n  let y = 0;\n  x = 1;\n  y = 2;\n  x++;\n  y--;\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  x = 1;\n  y = 2;\n  x++;\n  y--;');
});

test('it pads the boundary between an instantiation-headed and a call-headed declaration', () => {
  const src = `function f(before, after) {\n  const ops = new MyersDiff(splitLines(before), splitLines(after)).buildOps();\n  const hunks = buildHunks(ops);\n  use(hunks);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('.buildOps();\n\n  const hunks = buildHunks(ops);');
});

test('it keeps adjacent instantiation-headed declarations glued', () => {
  const src = `function f(opts) {\n  const parser = new Parser(opts);\n  const printer = new Printer(opts);\n  use(parser, printer);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude(
    '  const parser = new Parser(opts);\n  const printer = new Printer(opts);',
  );
});

test('it pads the boundary between an instantiation and a plain assignment', () => {
  const src = `function f() {\n  let tail = 0;\n  const trace = new Map();\n  tail = trace.size;\n  use(tail);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  const trace = new Map();\n\n  tail = trace.size;');
});

test('it pads the boundary between a bare instantiation statement and a call statement', () => {
  const src = `function f(config) {\n  new Logger(config);\n  start();\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  new Logger(config);\n\n  start();');
});

test('it treats new in argument position as part of a call statement', () => {
  const src = `function f() {\n  use(new Date());\n  log('done');\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it keeps a trailing same-line line comment attached to the preceding var', () => {
  const src = `function f() {\n  const TIMEOUT_MS = 5000; // five seconds\n  doStuff(TIMEOUT_MS);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  const TIMEOUT_MS = 5000; // five seconds\n\n  doStuff(TIMEOUT_MS);');
});

test('it keeps a trailing block comment attached to the preceding var', () => {
  const src = `function f() {\n  const X = 1; /* note */\n  return X;\n}\n`;
  const output = transform(src).output;

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
  const output = transform(src).output;

  expect(output).toMatchInlineSnapshot(`
    "function f() {
      const x = 1;

      // explains the next line
      return x;
    }
    "
  `);
});

test('it is a no-op when run again on already-formatted code', () => {
  const src = `const a = 1;\ndoA();\nfunction f() {\n  const x = 1;\n  return x;\n}\nclass C {\n  a = 1;\n  m() {}\n}\n`;
  const once = transform(src).output;
  const twice = transform(once).output;

  expect(once).not.toBe(src);
  expect(twice).toBe(once);
});

test('it stays idempotent across many transform cycles', () => {
  let s = `function f(xs) {\n  const seen = [];\n  setup();\n  if (ready) {\n    go();\n  }\n  for (const x of xs) {\n    use(x);\n  }\n  return seen;\n}\n`;

  for (let i = 0; i < 5; i++) {
    s = transform(s).output;
  }

  const after = transform(s).output;

  expect(after).toBe(s);
});

test('it preserves spacing exactly when the input is already compliant', () => {
  const compliant = `function f() {\n  const x = 1;\n\n  return x;\n}\n`;
  const result = transform(compliant);
  const output = result.output;
  const edits = result.edits;

  expect(output).toBe(compliant);
  expect(edits).toBe(0);
});

test('it returns the input untouched with a message when the source cannot parse', () => {
  const result = transform('const x = ;;;@@@!');
  const output = result.output;
  const edits = result.edits;
  const parseError = result.parseError;

  expect(output).toBe('const x = ;;;@@@!');
  expect(edits).toBe(0);
  expect(parseError).toInclude('Unexpected token');
});

test('it leaves a leading-semicolon ASI statement intact instead of orphaning the semicolon', () => {
  const src = `function f() {\n  const v = "1"\n  ;(store as Stub).set(v)\n  return v\n}\n`;
  const output = transform(src).output;

  // the const and the `;(expr)` share a line via the leading semicolon, so that
  // pair must stay untouched; the blank before `return` is still added
  expect(output).toInclude('  const v = "1"\n  ;(store as Stub).set(v)');
  expect(output).toInclude('(store as Stub).set(v)\n\n  return v');
});

test('it parses old-style type assertions in a .ts file', () => {
  const src = 'const setup = init();\nconst x = <string>getValue();\nuse(x);\n';
  const result = transform(src, { filename: 'file.ts' });
  const output = result.output;
  const parseError = result.parseError;

  expect(parseError).toBeNil();
  expect(output).toInclude('const x = <string>getValue();\n\nuse(x);');
});

test('it parses generic arrow functions in a .ts file', () => {
  const src = 'const id = <T>(a: T): T => a;\nid(1);\n';
  const result = transform(src, { filename: 'file.ts' });
  const parseError = result.parseError;
  const edits = result.edits;

  expect(parseError).toBeNil();
  expect(edits).toBe(1);
});

test('it parses JSX when the filename says .tsx', () => {
  const src = 'const el = <div>hi</div>;\nrender(el);\n';
  const result = transform(src, { filename: 'file.tsx' });
  const output = result.output;
  const parseError = result.parseError;

  expect(parseError).toBeNil();
  expect(output).toBe('const el = <div>hi</div>;\n\nrender(el);\n');
});

test('it defaults to the plain TypeScript dialect when no filename is given', () => {
  const parseError = transform('const x = <string>v;\nuse(x);\n').parseError;

  expect(parseError).toBeNil();
});

test('it handles multi-line template literals without corrupting offsets', () => {
  const src = 'function f() {\n  const t = `a\nb\nc`;\n  return t;\n}\n';
  const result = transform(src);
  const output = result.output;
  const parseError = result.parseError;

  expect(parseError).toBeNil();
  expect(output).toBe('function f() {\n  const t = `a\nb\nc`;\n\n  return t;\n}\n');
});

test('it removes a blank line between statements of the same kind', () => {
  const src = `async function f(db, userID, sessionID) {\n  await db.userCollection.create({ id: userID });\n\n  await db.sessionCollection.create({ id: sessionID, userID });\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude(
    '  await db.userCollection.create({ id: userID });\n  await db.sessionCollection.create({ id: sessionID, userID });',
  );
});

test('it removes blank lines splitting a run of single-line declarations', () => {
  const src = `function f() {\n  const a = 1;\n\n  const b = 2;\n\n  const c = 3;\n  use(a, b, c);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  const a = 1;\n  const b = 2;\n  const c = 3;\n\n  use(a, b, c);');
});

test('it collapses several blank lines between same-kind statements to flush', () => {
  const src = `function f() {\n  doFirst();\n\n\n\n  doSecond();\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude('  doFirst();\n  doSecond();');
});

test('it keeps a blank line when the gap holds a comment', () => {
  const src = `function f() {\n  doFirst();\n\n  // the second phase\n  doSecond();\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it keeps a blank line when a trailing comment sits on the previous line', () => {
  const src = `function f() {\n  doFirst(); // kicks off\n\n  doSecond();\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it pads the boundary between a method call and a bare call', () => {
  const src = `function f(file) {\n  fs.writeFileSync(file, 'const a = 1;');\n  expect(tryCheckFile(file, 'check')).toContainEntry(['outcome', 'changed']);\n}\n`;
  const output = transform(src).output;

  expect(output).toInclude(
    "  fs.writeFileSync(file, 'const a = 1;');\n\n  expect(tryCheckFile(file, 'check')).toContainEntry(['outcome', 'changed']);",
  );
});

test('it keeps runs of method calls and runs of bare calls glued', () => {
  const src = `function f(a, b) {\n  fs.rmSync(a);\n  fs.rmSync(b);\n\n  use(a);\n  log(b);\n}\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it pads between adjacent single-line exported type aliases', () => {
  const src = `export type CLIMode = 'write' | 'check' | 'dry';\nexport type FileOutcome = 'ok' | 'changed';\n`;
  const output = transform(src).output;

  expect(output).toBe(
    `export type CLIMode = 'write' | 'check' | 'dry';\n\nexport type FileOutcome = 'ok' | 'changed';\n`,
  );
});

test('it does not collapse the blank line around a type alias', () => {
  const src = `type Mode = 'a' | 'b';\n\nuse(mode);\n`;
  const result = transform(src);
  const output = result.output;
  const edits = result.edits;

  expect(edits).toBe(0);
  expect(output).toBe(src);
});

test('it pads a single-line interface apart from its neighbours', () => {
  const src = `use(a);\ninterface Marker { kind: string }\nuse(b);\n`;
  const output = transform(src).output;

  expect(output).toBe(`use(a);\n\ninterface Marker { kind: string }\n\nuse(b);\n`);
});

test('it pads after a directive prologue', () => {
  const src = `'use strict';\ndoStuff();\n`;
  const output = transform(src).output;

  expect(output).toBe(`'use strict';\n\ndoStuff();\n`);
});

test('it keeps adjacent directives glued', () => {
  const src = `'use strict';\n\n'use client';\ndoStuff();\n`;
  const output = transform(src).output;

  expect(output).toBe(`'use strict';\n'use client';\n\ndoStuff();\n`);
});

test('it is a no-op when run again on code with removed blank lines', () => {
  const src = `function f() {\n  doFirst();\n\n  doSecond();\n\n  doThird();\n}\n`;
  const once = transform(src).output;
  const twice = transform(once).output;

  expect(once).not.toBe(src);
  expect(twice).toBe(once);
});
