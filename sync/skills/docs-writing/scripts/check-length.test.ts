import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-length-'));

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

  const scriptPath = fileURLToPath(new URL('check-length.sh', import.meta.url));

  const writeLines = async (path: string, count: number) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });

    // Each line is a list item, which the prose check's paragraph limit skips.
    await writeFile(join(directory, path), '- The tool reads one file.\n'.repeat(count));
  };

  const writeText = async (path: string, text: string) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), text);
  };

  const run = (...args: readonly string[]) =>
    $`bash ${scriptPath} ${args}`.cwd(directory).env(env).nothrow().quiet();

  return { directory, writeLines, writeText, run };
}

test('it fails when the root README is over the front page limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 101);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 101 lines, over the front page README limit of 100 (target 80; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 1 over the line limit\n',
    stderr: '',
  });
});

test('it warns and passes when a README is over its target but within its limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 81);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      'README.md: 81 lines, over the front page README target of 80 (limit 100; warning)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it holds a README under packages/ to the package limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('packages/parser/README.md', 100);
  await ctx.writeLines('packages/runner/README.md', 101);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'packages/parser/README.md: 100 lines, over the package README target of 80 (limit 100; warning)\n' +
      'packages/runner/README.md: 101 lines, over the package README limit of 100 (target 80; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 2 READMEs, 1 over the line limit\n',
    stderr: '',
  });
});

test('it fails a folder README over 70 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('kernel/README.md', 71);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      'kernel/README.md: 71 lines, over the folder README limit of 70 (target 60; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 2 READMEs, 1 over the line limit\n',
    stderr: '',
  });
});

test('it holds a README below a package folder to the folder limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('packages/parser/fixtures/README.md', 71);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'packages/parser/fixtures/README.md: 71 lines, over the folder README limit of 70 (target 60; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 1 over the line limit\n',
    stderr: '',
  });
});

test('it holds a README beside a public package.json outside packages/ to the folder limit', async () => {
  const ctx = await setupTest();

  await ctx.writeText('tools/lint/package.json', '{ "name": "lint" }\n');
  await ctx.writeLines('tools/lint/README.md', 71);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'tools/lint/README.md: 71 lines, over the folder README limit of 70 (target 60; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 1 over the line limit\n',
    stderr: '',
  });
});

test('it holds a spike README under docs/design to the folder limit and its results.md to no cap', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('docs/design/sync/spikes/cold-start/README.md', 71);
  await ctx.writeLines('docs/design/sync/spikes/cold-start/results.md', 251);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'docs/design/sync/spikes/cold-start/README.md: 71 lines, over the folder README limit of 70 (target 60; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 1 over the line limit\n',
    stderr: '',
  });
});

test('it fails when check-prose finds a violation in a spike results.md', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('research/cold-start/README.md', 10);
  await ctx.writeText('research/cold-start/results.md', 'The cache is load-bearing.\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'research/cold-start/README.md: 10 lines (folder README; target 60, limit 70)\n' +
      '\n' +
      'Banned words:\n' +
      'research/cold-start/results.md:1:The cache is load-bearing.\n' +
      '\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it accepts --package and ignores it', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 101);

  const result = await ctx.run('--package', 'README.md', '--package', 'missing/README.md');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 101 lines, over the front page README limit of 100 (target 80; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 1 over the line limit\n',
    stderr:
      "check-length: --package is deprecated and ignored; a README's limit comes from its path\n" +
      "check-length: --package is deprecated and ignored; a README's limit comes from its path\n",
  });
});

test('it warns and passes when a docs file is over its cap', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('docs/architecture/overview.md', 251);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      'docs/architecture/overview.md: 251 lines, over the docs cap of 250 (warning: cut points, then split at a code boundary)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it holds a runbook to a cap of 300 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('docs/runbooks/operations.md', 300);
  await ctx.writeLines('docs/runbooks/releasing.md', 301);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      'docs/runbooks/releasing.md: 301 lines, over the docs cap of 300 (warning: cut points, then split at a code boundary)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 0 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it reads docs/README.md as a doc, not as a README', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('docs/README.md', 100);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      '\ncheck-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 0 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it passes when every README and doc is under its limit and cap', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 50);
  await ctx.writeLines('docs/guides/setup.md', 250);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      'README.md: 50 lines (front page README; target 80, limit 100)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it fails when check-prose finds a violation in a doc', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);

  await mkdir(join(ctx.directory, 'docs'), { recursive: true });
  await writeFile(join(ctx.directory, 'docs/overview.md'), 'The cache is load-bearing.\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      '\n' +
      'Banned words:\n' +
      'docs/overview.md:1:The cache is load-bearing.\n' +
      '\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it fails when check-prose finds a violation in a skill', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeText('.claude/skills/demo/SKILL.md', 'The cache is load-bearing.\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      '\n' +
      'Banned words:\n' +
      '.claude/skills/demo/SKILL.md:1:The cache is load-bearing.\n' +
      '\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it skips a skill that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeText('.gitattributes', '.claude/skills/vendor-db/** linguist-vendored\n');
  await ctx.writeText('.claude/skills/vendor-db/SKILL.md', 'The cache is load-bearing.\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it fails when the repo has check-skill and a skill fails it', async () => {
  const ctx = await setupTest();

  const checkSkill = fileURLToPath(
    new URL('../../skill-writing/scripts/check-skill.sh', import.meta.url),
  );

  await ctx.writeLines('README.md', 10);

  const source = await readFile(checkSkill, 'utf8');

  await ctx.writeText('.claude/skills/skill-writing/scripts/check-skill.sh', source);
  await ctx.writeText('.claude/skills/demo/SKILL.md', '---\nname: demo\n---\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      '.claude/skills/demo/SKILL.md: has no description\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});

test('it checks a README whose path is not ASCII', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);
  await ctx.writeLines('café/README.md', 71);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      'café/README.md: 71 lines, over the folder README limit of 70 (target 60; error)\n' +
      '\n' +
      'check-prose: clean (candidates above, if any, need judgment only)\n' +
      '\n' +
      'check-length: 2 READMEs, 1 over the line limit\n',
    stderr: '',
  });
});

test('it fails a value with a unit under docs/architecture but not one in code or a year', async () => {
  const ctx = await setupTest();

  await ctx.writeLines('README.md', 10);

  await mkdir(join(ctx.directory, 'docs/architecture'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'docs/architecture/overview.md'),
    [
      'The design dates from the 1990s.',
      'The grid is 2d.',
      'Run `sleep 5s` to wait.',
      'The reaper waits 30 s.',
      '',
    ].join('\n'),
  );

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'README.md: 10 lines (front page README; target 80, limit 100)\n' +
      '\n' +
      'Values with units under docs/architecture (the code owns its values; code blocks are exempt):\n' +
      'docs/architecture/overview.md:4:The reaper waits 30 s.\n' +
      '\n' +
      '\n' +
      'check-length: 1 READMEs, 0 over the line limit\n',
    stderr: '',
  });
});
