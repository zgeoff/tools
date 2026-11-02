import { expect, test } from 'bun:test';
import { collectBannedVerbs } from './collect-banned-verbs.ts';

test('it collects each code-span verb from the lead to the sentence after the list', () => {
  const markdown = [
    '## Function names',
    '',
    '- Never use `make` or `to` as a whole name.',
    '- Never start a name with `process`, `manage`, `do`, `perform`, `execute`, `compute`, `fetch`,',
    '  `save`, `store`, `delete`, `search` or `lookup`, or with `handle` outside a callback. These verbs',
    '  say nothing about I/O or a miss. For a database read that can miss, use `read` and return `null`.',
  ].join('\n');

  expect(collectBannedVerbs(markdown)).toStrictEqual([
    'process',
    'manage',
    'do',
    'perform',
    'execute',
    'compute',
    'fetch',
    'save',
    'store',
    'delete',
    'search',
    'lookup',
    'handle',
  ]);
});

test('it throws for a skill with no banned-verb bullet', () => {
  expect(() => collectBannedVerbs('## Function names\n\n- `make` takes a suffix.\n')).toThrow(
    "the code-style skill has no bullet from '- Never start a name with' to 'These verbs say nothing'",
  );
});

test('it throws for a banned-verb bullet that lists no verb', () => {
  expect(() =>
    collectBannedVerbs(
      '## Function names\n\n- Never start a name with a vague verb. These verbs say nothing.\n',
    ),
  ).toThrow('the code-style skill bans no verb in its banned-verb bullet');
});
