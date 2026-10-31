import { expect, test } from 'bun:test';
import { parseDocsChecks } from './parse-docs-checks.ts';

test('it reads no docs checks from a repo with no check:docs script', () => {
  expect(parseDocsChecks(undefined)).toStrictEqual({ kind: 'none' });
});

test('it reads each docs check the script names, once each', () => {
  expect(parseDocsChecks('chex prose length  links prose')).toStrictEqual({
    kind: 'named',
    checks: ['prose', 'length', 'links'],
  });
});

test.each([
  ['a script that runs another program', 'bash scripts/check-docs.sh'],
  ['a script that names a repo check', 'chex length commits'],
  ['a script that names no check', 'chex'],
  ['a script that chains a command', 'chex length && echo done'],
  ['a script that hands a path to a check', 'chex prose docs/guide.md'],
])('it refuses %s', (_, script) => {
  expect(parseDocsChecks(script)).toStrictEqual({
    kind: 'refused',
    message: `package.json runs "${script}" as check:docs; write it as chex and the docs checks it takes, from prose, length, links, readmes, vision, skill, such as "chex prose length links", so CI runs each check as its own step.`,
  });
});
