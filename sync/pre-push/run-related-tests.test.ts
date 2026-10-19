import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRelatedTests } from './run-related-tests.ts';

// A temp directory standing in for a repo root, with an empty src/.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-related-tests-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, 'src'));

  return { directory };
}

async function runScript(cwd: string, args: readonly string[]) {
  const subprocess = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'run-related-tests.ts'), ...args],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);

  return { stdout, stderr, exitCode };
}

test('#resolveRelatedTests selects a test file that exists', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/a.test.ts'), '');

  expect(resolveRelatedTests(['src/a.test.ts'], ctx.directory)).toStrictEqual(['src/a.test.ts']);
});

test('#resolveRelatedTests selects the sibling test of a source file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/a.ts'), '');
  await writeFile(join(ctx.directory, 'src/a.test.ts'), '');

  expect(resolveRelatedTests(['src/a.ts'], ctx.directory)).toStrictEqual(['src/a.test.ts']);
});

test('#resolveRelatedTests selects the sibling test of a TSX component', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/view.tsx'), '');
  await writeFile(join(ctx.directory, 'src/view.test.tsx'), '');

  expect(resolveRelatedTests(['src/view.tsx'], ctx.directory)).toStrictEqual(['src/view.test.tsx']);
});

test('#resolveRelatedTests skips a source file with no sibling test and a deleted test file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/a.ts'), '');

  expect(resolveRelatedTests(['src/a.ts', 'src/gone.test.ts'], ctx.directory)).toBeEmpty();
});

test('#resolveRelatedTests skips a declaration file even when a test sits beside it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/types.d.ts'), '');
  await writeFile(join(ctx.directory, 'src/types.d.test.ts'), '');

  expect(resolveRelatedTests(['src/types.d.ts'], ctx.directory)).toBeEmpty();
});

test('#resolveRelatedTests skips files that are not TypeScript', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/a.md'), '');
  await writeFile(join(ctx.directory, 'src/a.test.ts'), '');

  expect(resolveRelatedTests(['src/a.md', 'README.md'], ctx.directory)).toBeEmpty();
});

test('#resolveRelatedTests keeps the order of the paths and drops duplicates', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'src/b.ts'), '');
  await writeFile(join(ctx.directory, 'src/b.test.ts'), '');
  await writeFile(join(ctx.directory, 'src/a.test.ts'), '');

  expect(
    resolveRelatedTests(['src/b.ts', 'src/a.test.ts', 'src/b.test.ts'], ctx.directory),
  ).toStrictEqual(['src/b.test.ts', 'src/a.test.ts']);
});

test('#runRelatedTests exits 0 and says so when no path has a related test', async () => {
  const ctx = await setupTest();
  const run = await runScript(ctx.directory, ['src/a.ts']);

  expect(run.exitCode).toBe(0);
  expect(run.stdout).toBe('run-related-tests: no related tests\n');
});

test('#runRelatedTests runs only the related test through the test script and exits 0', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test' } }),
  );

  await writeFile(
    join(ctx.directory, 'src/a.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it adds', () => {\n  expect(1 + 1).toBe(2);\n});\n",
  );

  // A failing test whose path holds the related test's path: a name filter
  // would run it too.
  await mkdir(join(ctx.directory, 'other/src'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'other/src/a.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it fails', () => {\n  expect(1).toBe(2);\n});\n",
  );

  const run = await runScript(ctx.directory, ['src/a.ts']);

  expect(run.exitCode).toBe(0);
  expect(run.stderr).toInclude('1 pass');
  expect(run.stderr).toInclude('0 fail');
});

test('#runRelatedTests exits with the failing code when the related test fails', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test' } }),
  );

  await writeFile(
    join(ctx.directory, 'src/a.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it adds', () => {\n  expect(1 + 1).toBe(3);\n});\n",
  );

  const run = await runScript(ctx.directory, ['src/a.test.ts']);

  expect(run.exitCode).toBe(1);
});
