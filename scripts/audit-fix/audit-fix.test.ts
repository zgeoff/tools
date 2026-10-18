import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
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

  const root = fileURLToPath(new URL('../..', import.meta.url));
  const folders = ['scripts/audit-fix', 'packages/std/src'];

  const text = await readFile(join(root, '.github/workflows/audit-fix.yml'), 'utf8');

  // The workflow checks out these folders and no others, so a folder it drops fails here.
  const checkoutStep = expect.objectContaining({
    name: 'Check out the audit-fix script',
    with: expect.objectContaining({ 'sparse-checkout': `${folders.join('\n')}\n` }),
  });

  expect(Bun.YAML.parse(text)).toMatchObject({
    jobs: { 'audit-fix': { steps: expect.arrayContaining([checkoutStep]) } },
  });

  // The same folders, and no node_modules, as in a caller repo whose install lacks the tools
  // packages.
  await Promise.all(
    folders.map((folder) => cp(join(root, folder), join(dir, folder), { recursive: true })),
  );

  const result = Bun.spawnSync(
    ['bun', join(dir, 'scripts/audit-fix/audit-fix.ts'), '--title-file', 'title.txt'],
    { cwd: dir },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('usage: audit-fix.ts --title-file <path>');
});
