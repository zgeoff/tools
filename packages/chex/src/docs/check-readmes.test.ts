import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-readmes-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // A pre-push hook in a linked worktree exports GIT_DIR, which would point git init and the
  // script's git calls at the real repository.
  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  await $`git init -q`.cwd(directory).env(env).quiet();

  const scriptPath = fileURLToPath(new URL('check-readmes.sh', import.meta.url));

  const writeText = async (path: string, text: string) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), text);
  };

  const run = (...args: readonly string[]) =>
    $`bash ${scriptPath} ${args}`.cwd(directory).env(env).nothrow().quiet();

  const advice =
    'not one of the five kinds of README; move its content into docs/, or into a code comment beside the code it explains';

  return { writeText, run, advice };
}

test('it passes the root, package, docs index and design READMEs', async () => {
  const ctx = await setupTest();

  await ctx.writeText('README.md', '# Demo\n');
  await ctx.writeText('package.json', '{}\n');
  await ctx.writeText('packages/parser/package.json', '{}\n');
  await ctx.writeText('packages/parser/README.md', '# Parser\n');
  await ctx.writeText('services/api/go.mod', 'module api\n');
  await ctx.writeText('services/api/README.md', '# API\n');
  await ctx.writeText('crates/core/Cargo.toml', '[package]\n');
  await ctx.writeText('crates/core/README.md', '# Core\n');
  await ctx.writeText('docs/README.md', '# Docs\n');
  await ctx.writeText('docs/design/sync/README.md', '# Sync\n');
  await ctx.writeText('docs/design/sync/conflicts/README.md', '# Conflicts\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-readmes: 7 READMEs, 0 not one of the five kinds\n',
    stderr: '',
  });
});

test('it passes spike READMEs and the index of a folder of spikes', async () => {
  const ctx = await setupTest();

  await ctx.writeText('docs/design/sync/README.md', '# Sync\n');
  await ctx.writeText('docs/design/sync/spikes/cold-start/README.md', '# Spike: Cold start\n');
  await ctx.writeText('research/README.md', '# Research\n');

  await ctx.writeText(
    'research/pool-size/README.md',
    '```markdown\n# Not the title\n```\n\n# Spike: Pool size\n',
  );

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-readmes: 4 READMEs, 0 not one of the five kinds\n',
    stderr: '',
  });
});

test('it fails a README that is none of the five kinds, and says what to do', async () => {
  const ctx = await setupTest();

  await ctx.writeText('README.md', '# Demo\n');
  await ctx.writeText('src/cache/README.md', '# Cache\n');
  await ctx.writeText('docs/guides/README.md', '# Guides\n');
  await ctx.writeText('docs/design/README.md', '# Designs\n');
  await ctx.writeText('docs/design/sync/spikes/README.md', '# Spikes\n');
  await ctx.writeText('docs/design/sync/spikes/cold-start/README.md', '# Cold start\n');
  await ctx.writeText('notes/README.md', '# Notes\n\nA Spike: Pool size heading is not an H1.\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      `docs/design/README.md: ${ctx.advice}\n` +
      `docs/design/sync/spikes/README.md: ${ctx.advice}\n` +
      `docs/design/sync/spikes/cold-start/README.md: ${ctx.advice}\n` +
      `docs/guides/README.md: ${ctx.advice}\n` +
      `notes/README.md: ${ctx.advice}\n` +
      `src/cache/README.md: ${ctx.advice}\n` +
      'check-readmes: 7 READMEs, 6 not one of the five kinds\n',
    stderr: '',
  });
});

test('it fails a README in a design subfolder whose parent has no design README', async () => {
  const ctx = await setupTest();

  await ctx.writeText('docs/design/sync/conflicts/README.md', '# Conflicts\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      `docs/design/sync/conflicts/README.md: ${ctx.advice}\n` +
      'check-readmes: 1 READMEs, 1 not one of the five kinds\n',
    stderr: '',
  });
});

test('it skips a README that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writeText('.gitattributes', 'vendor/** linguist-vendored\n');
  await ctx.writeText('vendor/lib/README.md', '# Lib\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-readmes: 0 READMEs, 0 not one of the five kinds\n',
    stderr: '',
  });
});

test('it fails a spike index inside docs/design/, because the design README lists its spikes', async () => {
  const ctx = await setupTest();

  await ctx.writeText('README.md', '# Demo\n');
  await ctx.writeText('docs/design/sync/README.md', '# Sync\n');
  await ctx.writeText('docs/design/sync/spikes/README.md', '# Spikes\n');
  await ctx.writeText('docs/design/sync/spikes/cold-start/README.md', '# Spike: Cold start\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      `docs/design/sync/spikes/README.md: ${ctx.advice}\n` +
      'check-readmes: 4 READMEs, 1 not one of the five kinds\n',
    stderr: '',
  });
});
