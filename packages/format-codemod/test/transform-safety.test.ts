import { expect, test } from 'bun:test';
import { transform } from '../src/transform.ts';

test('is a no-op when run again on already-formatted code', () => {
  const src = `const a = 1;\ndoA();\nfunction f() {\n  const x = 1;\n  return x;\n}\nclass C {\n  a = 1;\n  m() {}\n}\n`;
  const once = transform(src).output;
  const twice = transform(once).output;

  expect(once).not.toBe(src);
  expect(twice).toBe(once);
});

test('stays idempotent across many transform cycles', () => {
  let s = `function f(xs) {\n  const seen = [];\n  setup();\n  if (ready) {\n    go();\n  }\n  for (const x of xs) {\n    use(x);\n  }\n  return seen;\n}\n`;

  for (let i = 0; i < 5; i++) {
    s = transform(s).output;
  }
  const after = transform(s).output;

  expect(after).toBe(s);
});

test('preserves spacing exactly when the input is already compliant', () => {
  const compliant = `function f() {\n  const x = 1;\n\n  return x;\n}\n`;
  const { output, edits } = transform(compliant);

  expect(output).toBe(compliant);
  expect(edits).toBe(0);
});

test('returns the input untouched with a message when the source cannot parse', () => {
  const { output, edits, parseError } = transform('const x = ;;;@@@!');

  expect(output).toBe('const x = ;;;@@@!');
  expect(edits).toBe(0);
  expect(parseError).toInclude('Unexpected token');
});

test('leaves a leading-semicolon ASI statement intact instead of orphaning the semicolon', () => {
  const src = `function f() {\n  const v = "1"\n  ;(store as Stub).set(v)\n  return v\n}\n`;
  const { output } = transform(src);

  // the const and the `;(expr)` share a line via the leading semicolon, so that
  // pair must stay untouched; the blank before `return` is still added
  expect(output).toInclude('  const v = "1"\n  ;(store as Stub).set(v)');
  expect(output).toInclude('(store as Stub).set(v)\n\n  return v');
});

test('handles multi-line template literals without corrupting offsets', () => {
  const src = 'function f() {\n  const t = `a\nb\nc`;\n  return t;\n}\n';
  const { output, parseError } = transform(src);

  expect(parseError).toBeNil();
  expect(output).toBe('function f() {\n  const t = `a\nb\nc`;\n\n  return t;\n}\n');
});
