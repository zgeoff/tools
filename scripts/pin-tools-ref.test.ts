import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'pin-tools-ref-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, '.github/workflows'), { recursive: true });

  const scriptPath = fileURLToPath(new URL('pin-tools-ref.sh', import.meta.url));

  return { directory, scriptPath };
}

test('it pins every call to a zgeoff/tools workflow to the ref', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/repo-sync.yml'),
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@main\n',
  );

  await writeFile(
    join(ctx.directory, '.github/workflows/pr.yml'),
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v1 # shared checks\n',
  );

  const result = await $`bash ${ctx.scriptPath} sync-v2 ${ctx.directory}`.nothrow().quiet();
  const repoSync = await readFile(join(ctx.directory, '.github/workflows/repo-sync.yml'), 'utf8');
  const pr = await readFile(join(ctx.directory, '.github/workflows/pr.yml'), 'utf8');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      `${ctx.directory}/.github/workflows/pr.yml\n` +
      `${ctx.directory}/.github/workflows/repo-sync.yml\n`,
    stderr: '',
  });

  expect(repoSync).toBe(
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@sync-v2\n',
  );

  expect(pr).toBe(
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v2 # shared checks\n',
  );
});

test.each([
  ['a double-quoted', '"'],
  ['a single-quoted', "'"],
])('it keeps the closing quote of %s call', async (_label, quote) => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/pr.yml'),
    `jobs:\n  pr:\n    uses: ${quote}zgeoff/tools/.github/workflows/bun-checks.yml@main${quote}\n`,
  );

  await $`bash ${ctx.scriptPath} sync-v2 ${ctx.directory}`.nothrow().quiet();

  const pr = await readFile(join(ctx.directory, '.github/workflows/pr.yml'), 'utf8');

  expect(pr).toBe(
    `jobs:\n  pr:\n    uses: ${quote}zgeoff/tools/.github/workflows/bun-checks.yml@sync-v2${quote}\n`,
  );
});

test('it keeps the closing brace of a flow-style call', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/repo-sync.yml'),
    'jobs:\n  sync: {uses: zgeoff/tools/.github/workflows/repo-sync.yml@sync-v1}\n',
  );

  await $`bash ${ctx.scriptPath} sync-v2 ${ctx.directory}`.nothrow().quiet();

  const repoSync = await readFile(join(ctx.directory, '.github/workflows/repo-sync.yml'), 'utf8');

  expect(repoSync).toBe(
    'jobs:\n  sync: {uses: zgeoff/tools/.github/workflows/repo-sync.yml@sync-v2}\n',
  );
});

test('it prints only the files it changed', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/pinned.yml'),
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@sync-v2\n',
  );

  await writeFile(
    join(ctx.directory, '.github/workflows/floating.yml'),
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@main\n',
  );

  const result = await $`bash ${ctx.scriptPath} sync-v2 ${ctx.directory}`.nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: `${ctx.directory}/.github/workflows/floating.yml\n`,
    stderr: '',
  });
});

test('it leaves calls to other repositories alone', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/ci.yml'),
    'jobs:\n  ci:\n    uses: other-org/tools/.github/workflows/ci.yml@main\n',
  );

  await $`bash ${ctx.scriptPath} sync-v2 ${ctx.directory}`.nothrow().quiet();

  const ci = await readFile(join(ctx.directory, '.github/workflows/ci.yml'), 'utf8');

  expect(ci).toBe('jobs:\n  ci:\n    uses: other-org/tools/.github/workflows/ci.yml@main\n');
});

test('it leaves a call to an owner whose name ends in zgeoff alone', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/ci.yml'),
    'jobs:\n  ci:\n    uses: other-zgeoff/tools/.github/workflows/ci.yml@main\n',
  );

  const result = await $`bash ${ctx.scriptPath} sync-v2 ${ctx.directory}`.nothrow().quiet();
  const ci = await readFile(join(ctx.directory, '.github/workflows/ci.yml'), 'utf8');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });

  expect(ci).toBe('jobs:\n  ci:\n    uses: other-zgeoff/tools/.github/workflows/ci.yml@main\n');
});

test('it rejects a ref that holds a character outside a plain git ref', async () => {
  const ctx = await setupTest();
  const result = await $`bash ${ctx.scriptPath} ${'sync#v2'} ${ctx.directory}`.nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: "pin-tools-ref: 'sync#v2' is not a ref this script writes\n",
  });
});
