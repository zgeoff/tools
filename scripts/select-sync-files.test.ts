import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

test('it skips a file whose except names the repo and copies the rest', async () => {
  const files = [
    { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
    {
      source: 'sync/skills/demo/references/rust.md',
      target: '.claude/skills/demo/references/rust.md',
      except: ['acme/ledger'],
    },
  ];

  const result =
    await $`bash ${fileURLToPath(new URL('select-sync-files.sh', import.meta.url))} acme/ledger < ${Response.json(files)}`
      .nothrow()
      .quiet();

  expect(result.exitCode).toBe(0);

  expect(result.stdout.toString()).toBe(
    'copy\tsync/skills/demo/SKILL.md\t.claude/skills/demo/SKILL.md\t0644\n' +
      'skip\tsync/skills/demo/references/rust.md\t.claude/skills/demo/references/rust.md\t0644\n',
  );
});

test('it copies an excepted file to a repo the except does not name', async () => {
  const files = [
    {
      source: 'sync/skills/demo/references/rust.md',
      target: '.claude/skills/demo/references/rust.md',
      except: ['acme/ledger'],
    },
  ];

  const result =
    await $`bash ${fileURLToPath(new URL('select-sync-files.sh', import.meta.url))} acme/storefront < ${Response.json(files)}`
      .nothrow()
      .quiet();

  expect(result.exitCode).toBe(0);

  expect(result.stdout.toString()).toBe(
    'copy\tsync/skills/demo/references/rust.md\t.claude/skills/demo/references/rust.md\t0644\n',
  );
});

test('it matches the repo name without regard to case', async () => {
  const files = [
    { source: 'sync/demo.md', target: 'demo.md', mode: '0755', except: ['Acme/Ledger'] },
  ];

  const result =
    await $`bash ${fileURLToPath(new URL('select-sync-files.sh', import.meta.url))} acme/LEDGER < ${Response.json(files)}`
      .nothrow()
      .quiet();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('skip\tsync/demo.md\tdemo.md\t0755\n');
});
