import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'pin-tools-ref-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await mkdir(join(dir, '.github/workflows'), { recursive: true });

  const scriptPath = fileURLToPath(new URL('pin-tools-ref.sh', import.meta.url));

  return { dir, scriptPath };
}

test('it pins every call to a zgeoff/tools workflow to the ref', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, '.github/workflows/repo-sync.yml'),
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@main\n',
  );

  await writeFile(
    join(ctx.dir, '.github/workflows/pr.yml'),
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v1 # shared checks\n',
  );

  const result = spawnSync('bash', [ctx.scriptPath, 'sync-v2', ctx.dir], { encoding: 'utf8' });

  const repoSync = await readFile(join(ctx.dir, '.github/workflows/repo-sync.yml'), 'utf8');
  const pr = await readFile(join(ctx.dir, '.github/workflows/pr.yml'), 'utf8');

  expect(result.status).toBe(0);

  expect(repoSync).toBe(
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@sync-v2\n',
  );

  expect(pr).toBe(
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v2 # shared checks\n',
  );
});

test('it prints only the files it changed', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, '.github/workflows/pinned.yml'),
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@sync-v2\n',
  );

  await writeFile(
    join(ctx.dir, '.github/workflows/floating.yml'),
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@main\n',
  );

  const result = spawnSync('bash', [ctx.scriptPath, 'sync-v2', ctx.dir], { encoding: 'utf8' });

  expect(result.stdout).toBe(`${ctx.dir}/.github/workflows/floating.yml\n`);
});

test('it leaves calls to other repositories alone', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, '.github/workflows/ci.yml'),
    'jobs:\n  ci:\n    uses: other-org/tools/.github/workflows/ci.yml@main\n',
  );

  spawnSync('bash', [ctx.scriptPath, 'sync-v2', ctx.dir], { encoding: 'utf8' });

  const ci = await readFile(join(ctx.dir, '.github/workflows/ci.yml'), 'utf8');

  expect(ci).toBe('jobs:\n  ci:\n    uses: other-org/tools/.github/workflows/ci.yml@main\n');
});

test('it rejects a ref that holds a character outside a plain git ref', async () => {
  const ctx = await setupTest();

  const result = spawnSync('bash', [ctx.scriptPath, 'sync#v2', ctx.dir], { encoding: 'utf8' });

  expect(result.status).toBe(2);
  expect(result.stderr).toBe("pin-tools-ref: 'sync#v2' is not a ref this script writes\n");
});
