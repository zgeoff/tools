import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('it prints its usage when a file argument is missing', () => {
  const scriptPath = fileURLToPath(new URL('audit-fix.ts', import.meta.url));
  const result = Bun.spawnSync(['bun', scriptPath, '--title-file', 'title.txt']);

  expect(result.exitCode).toBe(1);

  expect(result.stderr.toString()).toContain(
    'usage: audit-fix.ts --title-file <path> --body-file <path> --review-file <path> [--pending-ignores <path>] [--expiry-days <1-90>]',
  );
});

test('it runs from the sparse checkout that audit-fix.yml makes, with no install', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'audit-fix-sparse-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // The same two folders the workflow checks out, and no node_modules, as in a caller repo whose
  // install lacks the tools packages.
  const root = fileURLToPath(new URL('../..', import.meta.url));

  await cp(join(root, 'scripts/audit-fix'), join(dir, 'scripts/audit-fix'), { recursive: true });
  await cp(join(root, 'packages/std/src'), join(dir, 'packages/std/src'), { recursive: true });

  const result = Bun.spawnSync(
    ['bun', join(dir, 'scripts/audit-fix/audit-fix.ts'), '--title-file', 'title.txt'],
    { cwd: dir },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('usage: audit-fix.ts --title-file <path>');
});
