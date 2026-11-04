import { expect, test } from 'bun:test';
import { collectBannedVerbs } from './collect-banned-verbs.ts';

test('it collects each code-span verb of an inline list, from the lead to the sentence after it', () => {
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

test('it collects the verbs of each nested item, and none from the advice after an item', () => {
  const markdown = [
    '## Function names',
    '',
    '- Never start a name with one of these verbs. They say nothing about I/O or a miss:',
    '  - `process`, `manage`, `do`, `perform`, `execute` or `compute`;',
    '  - `fetch`, `save`, `store`, `delete`, `search` or `lookup`. For a database read that can miss, use',
    '    `read` and return `null`;',
    '  - `handle`, outside a callback.',
    '- You may start a name with `resolve`.',
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
    "the code-style skill has no banned-verb bullet: neither '- Never start a name with one of these verbs.' with a nested list, nor '- Never start a name with' a list up to 'These verbs say nothing'",
  );
});

test('it throws for a banned-verb bullet that lists no verb', () => {
  expect(() =>
    collectBannedVerbs(
      '## Function names\n\n- Never start a name with one of these verbs. They say nothing:\n  - a vague one.\n',
    ),
  ).toThrow('the code-style skill bans no verb in its banned-verb bullet');
});
