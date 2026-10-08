import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'check-sync-manifest-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const scriptPath = fileURLToPath(new URL('check-sync-manifest.sh', import.meta.url));

  return { dir, scriptPath };
}

test('it fails when a skill folder holds a file its entry omits', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'sync/skills/demo/references'), { recursive: true });
  await writeFile(join(ctx.dir, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.dir, 'sync/skills/demo/references/go.md'), '# Go\n');

  await writeFile(
    join(ctx.dir, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  );

  const result = spawnSync('bash', [ctx.scriptPath], { cwd: ctx.dir, encoding: 'utf8' });

  expect(result.status).toBe(1);

  expect(result.stderr).toBe(
    "check-sync-manifest: entry 'skill-demo' ships sync/skills/demo/, but omits sync/skills/demo/references/go.md\n",
  );
});

test('it fails when no entry lists a file from a skill folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'sync/skills/demo'), { recursive: true });
  await writeFile(join(ctx.dir, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.dir, 'sync/manifest.json'), JSON.stringify([]));

  const result = spawnSync('bash', [ctx.scriptPath], { cwd: ctx.dir, encoding: 'utf8' });

  expect(result.status).toBe(1);

  expect(result.stderr).toBe(
    'check-sync-manifest: skill folder sync/skills/demo/ holds sync/skills/demo/SKILL.md, but no entry lists a file from that folder\n',
  );
});

test('it passes when the entry lists every file in its skill folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'sync/skills/demo/references'), { recursive: true });
  await writeFile(join(ctx.dir, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.dir, 'sync/skills/demo/references/go.md'), '# Go\n');

  await writeFile(
    join(ctx.dir, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [
          { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          {
            source: 'sync/skills/demo/references/go.md',
            target: '.claude/skills/demo/references/go.md',
          },
        ],
      },
    ]),
  );

  const result = spawnSync('bash', [ctx.scriptPath], { cwd: ctx.dir, encoding: 'utf8' });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
});
