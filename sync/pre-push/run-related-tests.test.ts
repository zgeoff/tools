import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { resolveRelatedTests } from './run-related-tests.ts';

// A temp directory standing in for a repo root, with an empty src/.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-related-tests-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, 'src'));

  return { directory };
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

  const run = Bun.spawnSync(
    [process.execPath, join(import.meta.dir, 'run-related-tests.ts'), 'src/a.ts'],
    { cwd: ctx.directory },
  );

  expect(run.exitCode).toBe(0);
  expect(run.stdout.toString()).toBe('run-related-tests: no related tests\n');
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

  const run = Bun.spawnSync(
    [process.execPath, join(import.meta.dir, 'run-related-tests.ts'), 'src/a.ts'],
    { cwd: ctx.directory },
  );

  expect(run.exitCode).toBe(0);
  expect(run.stderr.toString()).toInclude('1 pass');
  expect(run.stderr.toString()).toInclude('0 fail');
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

  const run = Bun.spawnSync(
    [process.execPath, join(import.meta.dir, 'run-related-tests.ts'), 'src/a.test.ts'],
    { cwd: ctx.directory },
  );

  expect(run.exitCode).toBe(1);
});

test.each([
  ['e2e/checkout.test.ts'],
  ['packages/shop/e2e/checkout.test.ts'],
  ['e2e/helpers.ts'],
  ['src/view.browser.test.tsx'],
  ['src/store.docker.test.ts'],
  ['src/clock.host.test.ts'],
])('#resolveRelatedTests leaves out the lane file %s', async (path) => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'e2e'));
  await mkdir(join(ctx.directory, 'packages/shop/e2e'), { recursive: true });
  await writeFile(join(ctx.directory, path), '');
  await writeFile(join(ctx.directory, 'e2e/helpers.test.ts'), '');

  expect(resolveRelatedTests([path], ctx.directory)).toBeEmpty();
});

test('#runRelatedTests passes --parallel=1 and the slow-host timeout to the test script when the host gets 1 worker', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'echo test-args' } }),
  );

  await writeFile(join(ctx.directory, 'src/a.test.ts'), '');

  const result = await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} src/a.ts`
    .cwd(ctx.directory)
    .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: '1' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: 'test-args --parallel=1 --timeout=15000 ./src/a.test.ts\n',
  });
});

test('#runRelatedTests passes the worker count and no timeout to the test script when the host gets more than 1 worker', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'echo test-args' } }),
  );

  await writeFile(join(ctx.directory, 'src/a.test.ts'), '');

  const result = await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} src/a.ts`
    .cwd(ctx.directory)
    .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: '3' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: 'test-args --parallel=3 ./src/a.test.ts\n',
  });
});

test('#runRelatedTests runs 50 related test files, the default cap', async () => {
  const ctx = await setupTest();

  const tests = Array.from({ length: 50 }, (_, index) => `src/t${index}.test.ts`);

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'echo test-args' } }),
  );

  await Promise.all(tests.map((path) => writeFile(join(ctx.directory, path), '')));

  const result = await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} ${tests}`
    .cwd(ctx.directory)
    .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: '2' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: `test-args --parallel=2 ${tests.map((path) => `./${path}`).join(' ')}\n`,
  });
});

test('#runRelatedTests skips with the CI notice past 50 related test files', async () => {
  const ctx = await setupTest();

  const tests = Array.from({ length: 51 }, (_, index) => `src/t${index}.test.ts`);

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'echo test-args' } }),
  );

  await Promise.all(tests.map((path) => writeFile(join(ctx.directory, path), '')));

  const result = await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} ${tests}`
    .cwd(ctx.directory)
    .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: '2' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      'run-related-tests: skipped, because the branch has 51 related unit test files, over the cap of 50; CI runs the full suite\n',
    stderr: '',
  });
});

test('#runRelatedTests skips past the cap that --max-files sets', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'echo test-args' } }),
  );

  await writeFile(join(ctx.directory, 'src/a.test.ts'), '');
  await writeFile(join(ctx.directory, 'src/b.test.ts'), '');
  await writeFile(join(ctx.directory, 'src/c.test.ts'), '');

  const result =
    await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} --max-files=2 src/a.test.ts src/b.test.ts src/c.test.ts`
      .cwd(ctx.directory)
      .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: '2' })
      .nothrow()
      .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout:
      'run-related-tests: skipped, because the branch has 3 related unit test files, over the cap of 2; CI runs the full suite\n',
  });
});

test.each([['none'], ['0'], ['9'.repeat(30)]])(
  '#runRelatedTests exits 2 for a --max-files of %s',
  async (value) => {
    const ctx = await setupTest();

    const result =
      await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} --max-files=${value} src/a.ts`
        .cwd(ctx.directory)
        .env({ PATH: process.env['PATH'] ?? '' })
        .nothrow()
        .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 2,
      stdout: '',
      stderr: `run-related-tests: --max-files is ${value}; set it to a whole number above 0\n`,
    });
  },
);

test('#runRelatedTests exits 2 for an option it does not declare', async () => {
  const ctx = await setupTest();

  const result = await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} --max-file=2 src/a.ts`
    .cwd(ctx.directory)
    .env({ PATH: process.env['PATH'] ?? '' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: expect.toStartWith("run-related-tests: Unknown option '--max-file'"),
  });
});

test.each([
  ['test-utils/build-order.ts'],
  ['packages/shop/test-utils/build-cart.ts'],
  ['bunfig.toml'],
])(
  '#runRelatedTests skips with the CI notice when the branch changes the shared test input %s',
  async (shared) => {
    const ctx = await setupTest();

    await writeFile(
      join(ctx.directory, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo test-args' } }),
    );

    await writeFile(join(ctx.directory, 'src/a.test.ts'), '');

    const result = await $`bun ${join(import.meta.dir, 'run-related-tests.ts')} src/a.ts ${shared}`
      .cwd(ctx.directory)
      .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: '2' })
      .nothrow()
      .quiet();

    expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
      exitCode: 0,
      stdout: `run-related-tests: skipped, because the branch changes ${shared}, a shared test helper or config; CI runs the full suite\n`,
    });
  },
);
