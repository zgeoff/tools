import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('select-sync-files.sh', import.meta.url));

test('it skips a file whose except names the repo and copies the rest', () => {
  const files = [
    { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
    {
      source: 'sync/skills/demo/references/rust.md',
      target: '.claude/skills/demo/references/rust.md',
      except: ['acme/ledger'],
    },
  ];

  const result = spawnSync('bash', [scriptPath, 'acme/ledger'], {
    input: JSON.stringify(files),
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);

  expect(result.stdout).toBe(
    'copy\tsync/skills/demo/SKILL.md\t.claude/skills/demo/SKILL.md\t0644\n' +
      'skip\tsync/skills/demo/references/rust.md\t.claude/skills/demo/references/rust.md\t0644\n',
  );
});

test('it copies an excepted file to a repo the except does not name', () => {
  const files = [
    {
      source: 'sync/skills/demo/references/rust.md',
      target: '.claude/skills/demo/references/rust.md',
      except: ['acme/ledger'],
    },
  ];

  const result = spawnSync('bash', [scriptPath, 'acme/storefront'], {
    input: JSON.stringify(files),
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);

  expect(result.stdout).toBe(
    'copy\tsync/skills/demo/references/rust.md\t.claude/skills/demo/references/rust.md\t0644\n',
  );
});

test('it matches the repo name without regard to case', () => {
  const files = [
    { source: 'sync/demo.md', target: 'demo.md', mode: '0755', except: ['Acme/Ledger'] },
  ];

  const result = spawnSync('bash', [scriptPath, 'acme/LEDGER'], {
    input: JSON.stringify(files),
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('skip\tsync/demo.md\tdemo.md\t0755\n');
});
