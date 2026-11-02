import { expect, test } from 'bun:test';
import { buildMockSyncEntry } from '../../test-utils/build-mock-sync-entry.ts';
import { renderSyncCommitSubject } from './render-sync-commit-subject.ts';

test('it names the one repo of an entry whose files all come from it', () => {
  expect(renderSyncCommitSubject(buildMockSyncEntry())).toBe(
    'chore: sync editorconfig from zgeoff/tools',
  );
});

test('it names each repo of an entry once, in the order its files first name them', () => {
  const entry = buildMockSyncEntry({
    name: 'skill-kettle',
    files: [
      {
        repo: 'zgeoff/skills',
        source: 'skills/kettle/SKILL.md',
        target: '.claude/skills/kettle/SKILL.md',
      },
      {
        repo: 'zgeoff/tools',
        source: 'sync/kettle/check.sh',
        target: '.claude/skills/kettle/scripts/check.sh',
      },
      {
        repo: 'zgeoff/skills',
        source: 'skills/kettle/references/a.md',
        target: '.claude/skills/kettle/references/a.md',
      },
    ],
  });

  expect(renderSyncCommitSubject(entry)).toBe(
    'chore: sync skill-kettle from zgeoff/skills and zgeoff/tools',
  );
});
