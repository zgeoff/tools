import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'check-prose-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // A clean environment: a pre-push hook in a linked worktree exports GIT_DIR, which would point
  // git init and the script's git calls at the real repository.
  const env = {
    PATH: process.env['PATH'],
    HOME: dir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  const runGit = (...args: readonly string[]) =>
    spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });

  runGit('init', '-q');

  const scriptPath = fileURLToPath(new URL('check-prose.sh', import.meta.url));
  const writeText = (path: string, text: string) => writeFile(join(dir, path), text);

  const runCommit = (message: string) => {
    runGit('add', '-A');
    runGit('commit', '-q', '-m', message);
  };

  const run = (...args: readonly string[]) =>
    spawnSync('bash', [scriptPath, ...args], { cwd: dir, env, encoding: 'utf8' });

  // Runs the script as a GitHub Actions pull-request run against a base branch on origin, in the
  // test repository or in a clone of it.
  const runInPullRequest = (baseRef: string, args: readonly string[], cwd = dir) =>
    spawnSync('bash', [scriptPath, ...args], {
      cwd,
      env: { ...env, GITHUB_BASE_REF: baseRef },
      encoding: 'utf8',
    });

  const createOrigin = async () => {
    const originDir = await mkdtemp(join(tmpdir(), 'check-prose-origin-'));

    onTestFinished(() => rm(originDir, { recursive: true, force: true }));
    spawnSync('git', ['init', '-q', '--bare'], { cwd: originDir, env });
    runGit('remote', 'add', 'origin', originDir);

    return originDir;
  };

  // Clones one branch of origin with no history, as actions/checkout does for a pull request.
  const createShallowClone = async (originDir: string, branch: string) => {
    const cloneDir = await mkdtemp(join(tmpdir(), 'check-prose-clone-'));

    onTestFinished(() => rm(cloneDir, { recursive: true, force: true }));

    spawnSync(
      'git',
      ['clone', '-q', '--depth', '1', '--branch', branch, `file://${originDir}`, cloneDir],
      { env },
    );

    return cloneDir;
  };

  return {
    runGit,
    writeText,
    runCommit,
    run,
    runInPullRequest,
    createOrigin,
    createShallowClone,
  };
}

test('it fails on a 251-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `# Guide\n\n${'word word word word word word word word word word\n'.repeat(25)}word\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('Paragraphs over 250 words in a changed file');
  expect(result.stdout).toInclude('guide.md:3:251 words');
});

test('it warns and passes on a 151-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${'word '.repeat(151)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('Paragraphs over 150 words in a changed file (warning');
  expect(result.stdout).toInclude('guide.md:3:151 words');
});

test('it warns and passes on a 250-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${'word '.repeat(250)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('guide.md:3:250 words');
  expect(result.stdout).not.toInclude('Paragraphs over 250 words');
});

test('it passes a 150-word paragraph without a warning', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${'word '.repeat(150)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it passes a 300-word fenced code block', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `# Guide\n\n\`\`\`text\n${'word word word word word word word word word word\n'.repeat(30)}\`\`\`\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it passes a long list, its wrapped lines and its later paragraphs', async () => {
  const ctx = await setupTest();

  const item = `- The first item.\n${'  word word word word word word word word word word\n'.repeat(30)}`;
  const step = `1. The first step.\n\n${'   word word word word word word word word word word\n'.repeat(30)}`;

  await ctx.writeText('guide.md', `# Guide\n\n${item}${item}\n${step}`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it passes a long table, block quote and frontmatter', async () => {
  const ctx = await setupTest();

  const row = `| ${'word '.repeat(300)}|`;
  const quote = '> word word word word word word word word word word\n'.repeat(30);

  await ctx.writeText(
    'guide.md',
    `---\ndescription: ${'word '.repeat(300)}\n---\n\n| Name |\n| ---- |\n${row}\n\n${quote}`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it counts prose up to a list that interrupts it', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `${'word '.repeat(200)}\n- ${'word '.repeat(200)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('guide.md:1:200 words');
});

test('it keeps a separate paragraph count for each changed file', async () => {
  const ctx = await setupTest();

  await ctx.writeText('first.md', `${'word '.repeat(150)}\n`);
  await ctx.writeText('second.md', `${'word '.repeat(150)}\n`);

  const result = ctx.run('first.md', 'second.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it skips a file the branch leaves unchanged since its base on origin', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);

  ctx.runCommit('add the old doc');
  ctx.runGit('update-ref', 'refs/remotes/origin/main', 'HEAD');

  await ctx.writeText('new.md', `${'word '.repeat(260)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.run('old.md', 'new.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');
  expect(result.stderr).not.toInclude('no merge base');
});

test('it checks uncommitted edits and says so when origin has no base', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);
  await ctx.writeText('edited.md', 'A short doc.\n');

  ctx.runCommit('add the docs');

  await ctx.writeText('edited.md', `${'word '.repeat(260)}\n`);

  const result = ctx.run('old.md', 'edited.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('edited.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');

  expect(result.stderr).toInclude(
    'no merge base with origin/main, so the paragraph check reads only uncommitted files',
  );
});

test('it checks a staged file before the first commit', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `${'word '.repeat(251)}\n`);

  ctx.runGit('add', 'guide.md');

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:1:251 words');
});

test('it fetches the base branch in a pull-request run with no origin history', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);

  ctx.runCommit('add the old doc');

  await ctx.createOrigin();

  ctx.runGit('push', '-q', 'origin', 'HEAD:main');
  ctx.runGit('update-ref', '-d', 'refs/remotes/origin/main');

  await ctx.writeText('new.md', `${'word '.repeat(260)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.runInPullRequest('main', ['old.md', 'new.md']);

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');
  expect(result.stderr).not.toInclude('no merge base');
});

test('it passes a long table without outer pipes', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `Name | Description\n--- | ---\n${'word '.repeat(150)}| ${'word '.repeat(150)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it skips HTML comments and upper-case pre blocks across blank lines and counts the prose after them', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `<!--\n\n${'word '.repeat(300)}\n\n-->\n\n<PRE>\n\n${'word '.repeat(300)}\n\n</PRE>\n\n${'word '.repeat(200)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('guide.md:3:');
  expect(result.stdout).not.toInclude('guide.md:9:');
  expect(result.stdout).toInclude('guide.md:13:200 words');
});

test('it skips an HTML comment that follows a list item with no blank line', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `- An item.\n<!--\n\n${'word '.repeat(300)}\n\n-->\n${'word '.repeat(251)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).not.toInclude('guide.md:4:');
  expect(result.stdout).toInclude('guide.md:7:251 words');
});

test('it skips an HTML comment that follows an indented code block with no blank line', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `Intro.\n\n    const answer = 42;\n<!--\n\n${'word '.repeat(300)}\n\n-->\n${'word '.repeat(251)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).not.toInclude('guide.md:6:');
  expect(result.stdout).toInclude('guide.md:9:251 words');
});

test('it counts the prose after a tag whose name only starts with pre', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `<preview>Text</preview>\n\n${'word '.repeat(251)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:3:251 words');
});

test('it warns on a paragraph that starts with an inline tag or an autolink', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `<https://example.com> ${'word '.repeat(250)}\n\n<em>Read this</em> ${'word '.repeat(249)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:1:251 words');
  expect(result.stdout).toInclude('guide.md:3:251 words');
});

test('it counts a paragraph that follows a heading with no blank line', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n${'word '.repeat(251)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:2:251 words');
});

test('it skips a long Setext heading', async () => {
  const ctx = await setupTest();

  const lines = 'word word word word word word word word word word\n'.repeat(26);

  await ctx.writeText('guide.md', `${lines}===\n\n${lines}------\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it counts a paragraph that starts on the line after an HTML comment closes', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `<!--\nA note for editors.\n-->\n${'word '.repeat(251)}\n\n<!-- A one-line note. -->\n${'word '.repeat(252)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:4:251 words');
  expect(result.stdout).toInclude('guide.md:7:252 words');
});

test('it counts only the PR documents in a shallow pull-request merge checkout', async () => {
  const ctx = await setupTest();

  await ctx.writeText('readme.md', 'A short doc.\n');

  ctx.runCommit('add the readme');
  ctx.runGit('branch', '-M', 'main');
  ctx.runGit('branch', 'feature');

  await ctx.writeText('base.md', `${'word '.repeat(260)}\n`);

  ctx.runCommit('add a doc on the base');
  ctx.runGit('checkout', '-q', 'feature');

  await ctx.writeText('pr.md', `${'word '.repeat(270)}\n`);

  ctx.runCommit('add a doc on the PR');
  ctx.runGit('checkout', '-q', '-b', 'pull-merge', 'main');
  ctx.runGit('merge', '-q', '--no-edit', 'feature');

  const originDir = await ctx.createOrigin();

  ctx.runGit('push', '-q', 'origin', 'main', 'pull-merge');

  const cloneDir = await ctx.createShallowClone(originDir, 'pull-merge');

  const result = ctx.runInPullRequest('main', ['base.md', 'pr.md'], cloneDir);

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('pr.md:1:270 words');
  expect(result.stdout).not.toInclude('base.md');
});

test('it checks a changed file whose name holds a space', async () => {
  const ctx = await setupTest();

  await ctx.writeText('user guide.md', `${'word '.repeat(251)}\n`);

  const result = ctx.run('user guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('user guide.md:1:251 words');
});

test('it reads the default branch from origin/HEAD', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);

  ctx.runCommit('add the old doc');
  ctx.runGit('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
  ctx.runGit('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');

  await ctx.writeText('new.md', `${'word '.repeat(251)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.run('old.md', 'new.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:251 words');
  expect(result.stdout).not.toInclude('old.md');
});
