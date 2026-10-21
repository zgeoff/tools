import { expect, test } from 'bun:test';
import { collectBannedVerbs } from './collect-banned-verbs.ts';

test('it collects each code-span verb of the banned verbs section, skipping those in parentheses', () => {
  const markdown = [
    '### Free verbs',
    '',
    '`resolve` is free.',
    '',
    '### Banned verbs',
    '',
    'The vague ones: `process`, `manage`. The near-synonyms: `execute` (→ `run`), `fetch` (→ `read`).',
    '',
    '### Changing the table',
    '',
    'Ask before you ban `steep`.',
  ].join('\n');

  expect(collectBannedVerbs(markdown)).toStrictEqual(['process', 'manage', 'execute', 'fetch']);
});
