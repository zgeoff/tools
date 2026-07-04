import { expect, test } from 'bun:test';
import { transform } from './transform.ts';

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
  const { output, edits } = transform(compliant);

  expect(output).toBe(compliant);
  expect(edits).toBe(0);
});

test('it returns the input untouched with a message when the source cannot parse', () => {
  const { output, edits, parseError } = transform('const x = ;;;@@@!');

  expect(output).toBe('const x = ;;;@@@!');
  expect(edits).toBe(0);
  expect(parseError).toInclude('Unexpected token');
});

test('it leaves a leading-semicolon ASI statement intact instead of orphaning the semicolon', () => {
  const src = `function f() {\n  const v = "1"\n  ;(store as Stub).set(v)\n  return v\n}\n`;
  const { output } = transform(src);

  // the const and the `;(expr)` share a line via the leading semicolon, so that
  // pair must stay untouched; the blank before `return` is still added
  expect(output).toInclude('  const v = "1"\n  ;(store as Stub).set(v)');
  expect(output).toInclude('(store as Stub).set(v)\n\n  return v');
});

test('it parses old-style type assertions in a .ts file', () => {
  const src = 'const setup = init();\nconst x = <string>getValue();\nuse(x);\n';
  const { output, parseError } = transform(src, { filename: 'file.ts' });

  expect(parseError).toBeNil();
  expect(output).toInclude('const x = <string>getValue();\n\nuse(x);');
});

test('it parses generic arrow functions in a .ts file', () => {
  const src = 'const id = <T>(a: T): T => a;\nid(1);\n';
  const { parseError, edits } = transform(src, { filename: 'file.ts' });

  expect(parseError).toBeNil();
  expect(edits).toBe(1);
});

test('it parses JSX when the filename says .tsx', () => {
  const src = 'const el = <div>hi</div>;\nrender(el);\n';
  const { output, parseError } = transform(src, { filename: 'file.tsx' });

  expect(parseError).toBeNil();
  expect(output).toBe('const el = <div>hi</div>;\n\nrender(el);\n');
});

test('it defaults to the plain TypeScript dialect when no filename is given', () => {
  const { parseError } = transform('const x = <string>v;\nuse(x);\n');

  expect(parseError).toBeNil();
});

test('it handles multi-line template literals without corrupting offsets', () => {
  const src = 'function f() {\n  const t = `a\nb\nc`;\n  return t;\n}\n';
  const { output, parseError } = transform(src);

  expect(parseError).toBeNil();
  expect(output).toBe('function f() {\n  const t = `a\nb\nc`;\n\n  return t;\n}\n');
});
