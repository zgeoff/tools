import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRelatedTests } from './run-related-tests.ts';

// A temp directory standing in for a repo root, with an empty src/.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'run-related-tests-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await mkdir(join(dir, 'src'));

  return { dir };
}

async function runScript(cwd: string, args: readonly string[]) {
  const proc = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'run-related-tests.ts'), ...args],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

test('#collectRelatedTests selects a test file that exists', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/a.test.ts'), '');

  expect(collectRelatedTests(['src/a.test.ts'], ctx.dir)).toStrictEqual(['src/a.test.ts']);
});

test('#collectRelatedTests selects the sibling test of a source file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/a.ts'), '');
  await writeFile(join(ctx.dir, 'src/a.test.ts'), '');

  expect(collectRelatedTests(['src/a.ts'], ctx.dir)).toStrictEqual(['src/a.test.ts']);
});

test('#collectRelatedTests selects the sibling test of a TSX component', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/view.tsx'), '');
  await writeFile(join(ctx.dir, 'src/view.test.tsx'), '');

  expect(collectRelatedTests(['src/view.tsx'], ctx.dir)).toStrictEqual(['src/view.test.tsx']);
});

test('#collectRelatedTests skips a source file with no sibling test and a deleted test file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/a.ts'), '');

  expect(collectRelatedTests(['src/a.ts', 'src/gone.test.ts'], ctx.dir)).toBeEmpty();
});

test('#collectRelatedTests skips a declaration file even when a test sits beside it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/types.d.ts'), '');
  await writeFile(join(ctx.dir, 'src/types.d.test.ts'), '');

  expect(collectRelatedTests(['src/types.d.ts'], ctx.dir)).toBeEmpty();
});

test('#collectRelatedTests skips files that are not TypeScript', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/a.md'), '');
  await writeFile(join(ctx.dir, 'src/a.test.ts'), '');

  expect(collectRelatedTests(['src/a.md', 'README.md'], ctx.dir)).toBeEmpty();
});

test('#collectRelatedTests keeps the order of the paths and drops duplicates', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'src/b.ts'), '');
  await writeFile(join(ctx.dir, 'src/b.test.ts'), '');
  await writeFile(join(ctx.dir, 'src/a.test.ts'), '');

  expect(
    collectRelatedTests(['src/b.ts', 'src/a.test.ts', 'src/b.test.ts'], ctx.dir),
  ).toStrictEqual(['src/b.test.ts', 'src/a.test.ts']);
});

test('#runRelatedTests exits 0 and says so when no path has a related test', async () => {
  const ctx = await setupTest();
  const run = await runScript(ctx.dir, ['src/a.ts']);

  expect(run.exitCode).toBe(0);
  expect(run.stdout).toBe('run-related-tests: no related tests\n');
});

test('#runRelatedTests runs only the related test through the test script and exits 0', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }));

  await writeFile(
    join(ctx.dir, 'src/a.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it adds', () => {\n  expect(1 + 1).toBe(2);\n});\n",
  );

  // A failing test whose path holds the related test's path: a name filter
  // would run it too.
  await mkdir(join(ctx.dir, 'other/src'), { recursive: true });

  await writeFile(
    join(ctx.dir, 'other/src/a.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it fails', () => {\n  expect(1).toBe(2);\n});\n",
  );

  const run = await runScript(ctx.dir, ['src/a.ts']);

  expect(run.exitCode).toBe(0);
  expect(run.stderr).toInclude('1 pass');
  expect(run.stderr).toInclude('0 fail');
});

test('#runRelatedTests exits with the failing code when the related test fails', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }));

  await writeFile(
    join(ctx.dir, 'src/a.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it adds', () => {\n  expect(1 + 1).toBe(3);\n});\n",
  );

  const run = await runScript(ctx.dir, ['src/a.test.ts']);

  expect(run.exitCode).toBe(1);
});
