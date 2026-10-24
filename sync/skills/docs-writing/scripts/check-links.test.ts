import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-links-'));

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

  const scriptPath = fileURLToPath(new URL('check-links.sh', import.meta.url));

  const writePage = async (path: string, lines: readonly string[]) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), `${lines.join('\n')}\n`);
  };

  const run = (...args: readonly string[]) =>
    $`bash ${scriptPath} ${args}`.cwd(directory).env(env).nothrow().quiet();

  return { writePage, run };
}

test('it passes when every relative link and anchor resolves', async () => {
  const ctx = await setupTest();

  await ctx.writePage('README.md', [
    '# Demo',
    '',
    'Read the [setup guide](docs/guides/setup.md#install-the-cli) and the [usage](#usage).',
    'The [second step](./docs/guides/setup.md#step-1) and the [home page](https://example.com/x.md).',
    '',
    '## Usage',
  ]);

  await ctx.writePage('docs/guides/setup.md', [
    '# Setup',
    '',
    'Back to the [README](../../README.md) and the [docs folder](../).',
    '',
    '## Install the `cli`',
    '',
    '## Step',
    '',
    '## Step',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-links: 2 files, every relative link resolves\n',
    stderr: '',
  });
});

test('it fails on a link to a missing file', async () => {
  const ctx = await setupTest();

  await ctx.writePage('README.md', ['# Demo', '', 'See [the guide](docs/missing.md).']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: 'README.md:3: (docs/missing.md) docs/missing.md does not exist\n',
  });
});

test('it fails on an anchor that no heading produces', async () => {
  const ctx = await setupTest();

  await ctx.writePage('docs/README.md', ['# Docs', '', 'See [setup](guide.md#setup).']);
  await ctx.writePage('docs/guide.md', ['# Guide', '', '## Install']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: 'docs/README.md:3: (guide.md#setup) docs/guide.md has no heading #setup\n',
  });
});

test('it fails on a link that leaves the repository', async () => {
  const ctx = await setupTest();

  await ctx.writePage('README.md', ['See [the sibling](../other/README.md).']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: 'README.md:1: (../other/README.md) points outside the repository\n',
  });
});

test('it skips links inside code blocks and code spans', async () => {
  const ctx = await setupTest();

  await ctx.writePage('README.md', [
    'Write `[text](missing.md)` for a link.',
    '',
    '```markdown',
    '[text](missing.md)',
    '```',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-links: 1 files, every relative link resolves\n',
    stderr: '',
  });
});

test('it reads only the READMEs, results.md files, docs/ and skills when no path is given', async () => {
  const ctx = await setupTest();

  await ctx.writePage('README.md', ['# Demo']);
  await ctx.writePage('notes/todo.md', ['See [the plan](missing.md).']);
  await ctx.writePage('.claude/skills/demo/SKILL.md', ['See [the README](../../../README.md).']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-links: 2 files, every relative link resolves\n',
    stderr: '',
  });
});

test('it fails on a broken link in a skill by default', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/references/stand-ins.md', [
    'See [`buildStub`](../../../../src/build-stub.ts).',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      '.claude/skills/demo/references/stand-ins.md:1: (../../../../src/build-stub.ts) src/build-stub.ts does not exist\n',
  });
});

test('it fails on a broken link in a spike results.md by default', async () => {
  const ctx = await setupTest();

  await ctx.writePage('research/cold-start/README.md', ['See [the results](results.md).']);
  await ctx.writePage('research/cold-start/results.md', ['See [the run log](runs/first.md).']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'research/cold-start/results.md:1: (runs/first.md) research/cold-start/runs/first.md does not exist\n',
  });
});

test('it skips a skill that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.gitattributes', ['.claude/skills/vendor-*/** linguist-vendored']);
  await ctx.writePage('.claude/skills/vendor-db/SKILL.md', ['See [the guide](missing.md).']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-links: 0 files, every relative link resolves\n',
    stderr: '',
  });
});

test('it reads the paths it is given', async () => {
  const ctx = await setupTest();

  await ctx.writePage('README.md', ['# Demo']);
  await ctx.writePage('notes/todo.md', ['See [the plan](missing.md).']);

  const result = await ctx.run('notes');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: 'notes/todo.md:1: (missing.md) notes/missing.md does not exist\n',
  });
});

test('it matches the anchors GitHub builds from code spans, emphasis and entities', async () => {
  const ctx = await setupTest();

  await ctx.writePage('README.md', [
    '[a](#the-div-element) [b](#using-optiont) [c](#fast-path) [d](#a--b) [e](#snake_case-keys)',
    '',
    '## The `<div>` element',
    '',
    '## Using `Option<T>`',
    '',
    '## _Fast_ path',
    '',
    '## A &amp; B',
    '',
    '## snake_case keys',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-links: 1 files, every relative link resolves\n',
    stderr: '',
  });
});

test('it skips footnotes and links inside HTML comments, and keeps parentheses in a target', async () => {
  const ctx = await setupTest();

  await ctx.writePage('docs/notes_(draft).md', ['# Notes']);

  await ctx.writePage('docs/README.md', [
    'See [the notes](notes_(draft).md).[^1]',
    '',
    '<!-- [old](missing.md) -->',
    '<!--',
    '[older](missing.md)',
    '-->',
    '',
    '[^1]: Some footnote text.',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-links: 2 files, every relative link resolves\n',
    stderr: '',
  });
});

test('it skips READMEs under .claude/ by default', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/README.md', [
    'See [the source](../../../src/missing.md).',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-links: 0 files, every relative link resolves\n',
    stderr: '',
  });
});
