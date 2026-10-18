import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import invariant from 'tiny-invariant';
import { isRecord } from '../../packages/std/src/is-record.ts';

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

  // The folders the workflow's sparse checkout lists, and no node_modules, as in a caller repo whose
  // install lacks the tools packages.
  const root = fileURLToPath(new URL('../..', import.meta.url));

  const folders = await readSparseCheckout(join(root, '.github/workflows/audit-fix.yml'));

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

// The sparse-checkout folders of the step that checks out the audit-fix script.
async function readSparseCheckout(path: string): Promise<string[]> {
  const text = await readFile(path, 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);
  const jobs = isRecord(workflow) ? workflow['jobs'] : undefined;
  const job = isRecord(jobs) ? jobs['audit-fix'] : undefined;
  const steps = isRecord(job) && Array.isArray(job['steps']) ? job['steps'] : [];

  const step: unknown = steps.find(
    (candidate: unknown) =>
      isRecord(candidate) && candidate['name'] === 'Check out the audit-fix script',
  );

  const options = isRecord(step) ? step['with'] : undefined;
  const list = isRecord(options) ? options['sparse-checkout'] : undefined;

  invariant(
    typeof list === 'string',
    `${path}: the audit-fix checkout step has no sparse-checkout`,
  );

  return list.split('\n').filter((folder) => folder.trim() !== '');
}
