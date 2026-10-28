import { expect, test } from 'bun:test';
import { isPathMatched } from './is-path-matched.ts';

test.each([
  ['a single star across folders', 'docker/app/Dockerfile', 'docker/*', true],
  ['a double star across folders', 'docker/app/Dockerfile', 'docker/**', true],
  ['a star inside a name', 'services/api/main.ts', 'services/*/main.ts', true],
  ['a path outside the pattern', 'README.md', 'docker/**', false],
  ['a question mark as one character', 'v1.yml', 'v?.yml', true],
  ['a question mark against two characters', 'v10.yml', 'v?.yml', false],
  ['a set of characters', 'b.txt', '[abc].txt', true],
  ['a character outside a set', 'd.txt', '[abc].txt', false],
  ['a negated set', 'd.txt', '[!abc].txt', true],
  ['a range', 'k.txt', '[a-m].txt', true],
  ['a dot as a literal', 'flakeXnix', 'flake.nix', false],
  ['an escaped star as a literal', 'a*b', String.raw`a\*b`, true],
  ['an escaped star against other text', 'axb', String.raw`a\*b`, false],
  ['an unclosed bracket as a literal', '[draft', '[draft', true],
  [
    'an at group with one of its alternatives',
    'services/api/main.ts',
    'services/@(api|web)/**',
    true,
  ],
  [
    'an at group with none of its alternatives',
    'services/db/main.ts',
    'services/@(api|web)/**',
    false,
  ],
  ['an optional group left out', 'flake.nix', 'flake?(.lock).nix', true],
  ['a plus group repeated', 'abab.txt', '+(ab).txt', true],
  ['a plus group left out', '.txt', '+(ab).txt', false],
  ['a star group left out', '.txt', '*(ab).txt', true],
  ['a not group against another name', 'docs/guide.txt', 'docs/!(*.md)', true],
  ['a not group against its own pattern', 'docs/guide.md', 'docs/!(*.md)', false],
  ['a nested group', 'a/xy/b', 'a/@(x@(y|z))/b', true],
  ['an unclosed group as plain characters', 'v@(1', 'v@(1', true],
  ['a character class', 'build/1/Dockerfile', 'build/[[:digit:]]/**', true],
  ['a character outside a class', 'build/x/Dockerfile', 'build/[[:digit:]]/**', false],
  ['an unknown class', 'a', '[[:kettle:]]', false],
  ['a negated class', 'a', '[![:digit:]]', true],
  ['two classes in one set', 'B', '[[:upper:][:digit:]]', true],
  ['a closing bracket after a class', 'x]', '[[:alpha:]]]', true],
  ['a closing bracket as the first member', ']', '[]a]', true],
  ['a dash at the end of a set', '-', '[a-]', true],
  ['an escaped dash in a set', 'b', String.raw`[a\-c]`, false],
  ['an unclosed class as plain members', ':', '[[:]', true],
])('it matches %s as bash does', (_label, path, pattern, expected) => {
  const bash = Bun.spawnSync(['bash', '-c', '[[ $1 == $2 ]]', 'bash', path, pattern]);

  expect(isPathMatched(path, pattern)).toBe(expected);
  expect(bash.exitCode === 0).toBe(expected);
});
