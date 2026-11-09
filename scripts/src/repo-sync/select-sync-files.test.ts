import { expect, test } from 'bun:test';
import { selectSyncFiles } from './select-sync-files.ts';

test('it skips a file whose except names the repo and copies the rest', () => {
  const rows = selectSyncFiles(
    [
      {
        repo: 'zgeoff/tools',
        source: 'sync/skills/demo/SKILL.md',
        target: '.claude/skills/demo/SKILL.md',
      },
      {
        repo: 'zgeoff/tools',
        source: 'sync/skills/demo/references/rust.md',
        target: '.claude/skills/demo/references/rust.md',
        except: ['acme/ledger'],
      },
    ],
    'acme/ledger',
  );

  expect(rows).toStrictEqual([
    {
      action: 'copy',
      source: '.repo-sync/sync/skills/demo/SKILL.md',
      target: '.claude/skills/demo/SKILL.md',
      mode: '0644',
    },
    {
      action: 'skip',
      source: '.repo-sync/sync/skills/demo/references/rust.md',
      target: '.claude/skills/demo/references/rust.md',
      mode: '0644',
    },
  ]);
});

test('it copies an excepted file to a repo the except does not name, with its own mode', () => {
  const rows = selectSyncFiles(
    [
      {
        repo: 'zgeoff/tools',
        source: 'sync/hooks/gate.sh',
        target: '.claude/hooks/gate.sh',
        mode: '0755',
        except: ['acme/ledger'],
      },
    ],
    'acme/storefront',
  );

  expect(rows).toStrictEqual([
    {
      action: 'copy',
      source: '.repo-sync/sync/hooks/gate.sh',
      target: '.claude/hooks/gate.sh',
      mode: '0755',
    },
  ]);
});

test('it matches the repo in an except list whatever the case of either', () => {
  const rows = selectSyncFiles(
    [{ repo: 'zgeoff/tools', source: 'sync/a.md', target: 'a.md', except: ['Acme/Ledger'] }],
    'acme/LEDGER',
  );

  expect(rows).toStrictEqual([
    { action: 'skip', source: '.repo-sync/sync/a.md', target: 'a.md', mode: '0644' },
  ]);
});

test('it gives a zgeoff/skills file its path in the checkout of that repo', () => {
  const rows = selectSyncFiles(
    [
      {
        repo: 'zgeoff/skills',
        source: 'skills/kettle/SKILL.md',
        target: '.claude/skills/kettle/SKILL.md',
      },
    ],
    'acme/ledger',
  );

  expect(rows).toStrictEqual([
    {
      action: 'copy',
      source: '.repo-sync-skills/skills/kettle/SKILL.md',
      target: '.claude/skills/kettle/SKILL.md',
      mode: '0644',
    },
  ]);
});
