import { expect, test } from 'bun:test';
import { readAvailableReferences } from './read-available-references.ts';

test('it keeps each reference whose file holds content, once, in gate order', async () => {
  const files: Readonly<Record<string, Uint8Array>> = {
    '/repo/.claude/skills/ticket-review/references/reasons.md': new TextEncoder().encode('# R\n'),
    '/repo/.claude/skills/tracker/references/fields.md': new TextEncoder().encode('# F\n'),
  };

  const references = await readAvailableReferences(
    (filePath) => Promise.resolve(files[filePath] ?? null),
    '/repo/.claude/skills',
    [
      {
        tool: 'mcp__tracker__update_ticket',
        skills: [],
        references: ['ticket-review/references/reasons.md', 'ticket-review/references/gone.md'],
      },
      {
        tool: 'mcp__tracker__close_ticket',
        skills: [],
        references: ['tracker/references/fields.md', 'ticket-review/references/reasons.md'],
      },
    ],
  );

  expect(references).toStrictEqual([
    'ticket-review/references/reasons.md',
    'tracker/references/fields.md',
  ]);
});
