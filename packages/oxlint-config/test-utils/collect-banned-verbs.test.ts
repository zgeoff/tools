import { expect, test } from 'bun:test';
import { collectBannedVerbs } from './collect-banned-verbs.ts';

test('it collects each code-span verb of the banned bullet up to the end of its first sentence', () => {
  const markdown = [
    '## Function names',
    '',
    '- `make` and `with` take a suffix: `toPosixPath`.',
    '- Banned: `process`, `manage`, `execute`,',
    '  `fetch`, and `handle` outside a callback. `resolve` is free: it names a lookup.',
    '- `steep` is next.',
  ].join('\n');

  expect(collectBannedVerbs(markdown)).toStrictEqual([
    'process',
    'manage',
    'execute',
    'fetch',
    'handle',
  ]);
});

test('it collects nothing from a skill with no banned bullet', () => {
  expect(collectBannedVerbs('## Function names\n\n- `make` takes a suffix.\n')).toStrictEqual([]);
});
