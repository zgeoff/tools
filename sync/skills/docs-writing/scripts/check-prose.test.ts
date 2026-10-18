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

// Wraps the words ten to a line, as an editor wraps a paragraph.
function buildWords(count: number, indent = '') {
  const words = Array.from({ length: count }, () => 'word');
  const lines: string[] = [];

  for (let start = 0; start < count; start += 10) {
    lines.push(indent + words.slice(start, start + 10).join(' '));
  }

  return lines.join('\n');
}

test('it fails on a 251-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${buildWords(251)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('Paragraphs over 250 words in a changed file');
  expect(result.stdout).toInclude('guide.md:3:251 words');
});

test('it warns and passes on a 151-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${buildWords(151)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('Paragraphs over 150 words in a changed file (warning');
  expect(result.stdout).toInclude('guide.md:3:151 words');
});

test('it warns and passes on a 250-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${buildWords(250)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('guide.md:3:250 words');
  expect(result.stdout).not.toInclude('Paragraphs over 250 words');
});

test('it passes a 150-word paragraph without a warning', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${buildWords(150)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it passes a 300-word fenced code block', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n\`\`\`text\n${buildWords(300)}\n\`\`\`\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it passes a long list, its wrapped lines and its later paragraphs', async () => {
  const ctx = await setupTest();

  const item = `- ${buildWords(300, '  ').trimStart()}`;
  const step = `1. The first step.\n\n${buildWords(300, '   ')}`;

  await ctx.writeText('guide.md', `# Guide\n\n${item}\n${item}\n\n${step}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it passes a long table, block quote and frontmatter', async () => {
  const ctx = await setupTest();

  const row = `| ${buildWords(300).replaceAll('\n', ' ')} |`;
  const quote = buildWords(300).replaceAll(/^/gmu, '> ');

  await ctx.writeText(
    'guide.md',
    `---\ndescription: ${buildWords(300).replaceAll('\n', ' ')}\n---\n\n| Name |\n| ---- |\n${row}\n\n${quote}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it counts prose up to a list that interrupts it', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `${buildWords(200)}\n- ${buildWords(200)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('guide.md:1:200 words');
});

test('it skips a file the branch leaves unchanged since its base on origin', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${buildWords(300)}\n`);

  ctx.runCommit('add the old doc');
  ctx.runGit('update-ref', 'refs/remotes/origin/main', 'HEAD');

  await ctx.writeText('new.md', `${buildWords(260)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.run('old.md', 'new.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');
  expect(result.stderr).not.toInclude('no merge base');
});

test('it checks uncommitted edits and says so when origin has no base', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${buildWords(300)}\n`);
  await ctx.writeText('edited.md', 'A short doc.\n');

  ctx.runCommit('add the docs');

  await ctx.writeText('edited.md', `${buildWords(260)}\n`);

  const result = ctx.run('old.md', 'edited.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('edited.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');

  expect(result.stderr).toInclude(
    'no merge base with origin/main, so the paragraph check reads only uncommitted files',
  );
});

test('it fetches the base branch in a pull-request run with no origin history', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${buildWords(300)}\n`);

  ctx.runCommit('add the old doc');

  await ctx.createOrigin();

  ctx.runGit('push', '-q', 'origin', 'HEAD:main');
  ctx.runGit('update-ref', '-d', 'refs/remotes/origin/main');

  await ctx.writeText('new.md', `${buildWords(260)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.runInPullRequest('main', ['old.md', 'new.md']);

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');
  expect(result.stderr).not.toInclude('no merge base');
});

test('it passes a long table without outer pipes', async () => {
  const ctx = await setupTest();

  const row = `${buildWords(150).replaceAll('\n', ' ')} | ${buildWords(150).replaceAll('\n', ' ')}`;

  await ctx.writeText('guide.md', `Name | Description\n--- | ---\n${row}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it skips HTML comments and upper-case pre blocks across blank lines and counts the prose after them', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `<!--\n\n${buildWords(300)}\n\n-->\n\n<PRE>\n\n${buildWords(300)}\n\n</PRE>\n\n${buildWords(200)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('guide.md:3:');
  expect(result.stdout).not.toInclude('guide.md:38:');
  expect(result.stdout).toInclude('guide.md:71:200 words');
});

test('it warns on a paragraph that starts with an inline tag or an autolink', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `<https://example.com> ${buildWords(250)}\n\n<em>Read this</em> ${buildWords(249)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:1:251 words');
  expect(result.stdout).toInclude('guide.md:27:251 words');
});

test('it counts a paragraph that follows a heading with no blank line', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n${buildWords(251)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:2:251 words');
});

test('it skips a long Setext heading', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `${buildWords(251)}\n===\n\n${buildWords(251)}\n------\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it counts a paragraph that starts on the line after an HTML comment closes', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `<!--\nA note for editors.\n-->\n${buildWords(251)}\n\n<!-- A one-line note. -->\n${buildWords(252)}\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:4:251 words');
  expect(result.stdout).toInclude('guide.md:32:252 words');
});

test('it counts only the PR documents in a shallow pull-request merge checkout', async () => {
  const ctx = await setupTest();

  await ctx.writeText('readme.md', 'A short doc.\n');

  ctx.runCommit('add the readme');
  ctx.runGit('branch', '-M', 'main');
  ctx.runGit('branch', 'feature');

  await ctx.writeText('base.md', `${buildWords(260)}\n`);

  ctx.runCommit('add a doc on the base');
  ctx.runGit('checkout', '-q', 'feature');

  await ctx.writeText('pr.md', `${buildWords(270)}\n`);

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

  await ctx.writeText('user guide.md', `${buildWords(251)}\n`);

  const result = ctx.run('user guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('user guide.md:1:251 words');
});

test('it reads the default branch from origin/HEAD', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${buildWords(300)}\n`);

  ctx.runCommit('add the old doc');
  ctx.runGit('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
  ctx.runGit('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');

  await ctx.writeText('new.md', `${buildWords(251)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.run('old.md', 'new.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:251 words');
  expect(result.stdout).not.toInclude('old.md');
});
