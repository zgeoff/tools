import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTempDir } from '../fs/create-temp-dir.ts';
import { readRunFolderPrefix } from '../fs/read-run-folder-prefix.ts';
import { createGitRepo } from './create-git-repo.ts';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

function setupTest() {
  const env = readGitEnv(createTempDir('git-home').path);

  return {
    env,
    readGit: (repo: string, args: readonly string[]) => runGit(repo, env, args),
  };
}

test('it makes one commit per entry, and returns the shas in order', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n' } },
    { message: 'add readme', files: { 'README.md': '# app\n' } },
  ]);

  const log = await ctx.readGit(repo.path, ['log', '--format=%H %s', 'main']);

  expect(log).toBe(`${repo.commits[1]} add readme\n${repo.commits[0]} add app\n`);
});

test('it builds each commit on the tree of its first parent, with its files applied', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n', 'old.txt': 'stale\n' } },
    { message: 'change', files: { 'old.txt': null, 'src/new.txt': 'fresh\n' } },
  ]);

  const first = await ctx.readGit(repo.path, [
    'ls-tree',
    '-r',
    '--name-only',
    repo.commits[0] ?? '',
  ]);

  const second = await ctx.readGit(repo.path, [
    'ls-tree',
    '-r',
    '--name-only',
    repo.commits[1] ?? '',
  ]);

  expect({ first, second }).toStrictEqual({
    first: 'app.ts\nold.txt\n',
    second: 'app.ts\nsrc/new.txt\n',
  });
});

test('it makes a second line of history with parent, from the commit it names', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n' } },
    { message: 'add readme', files: { 'README.md': '# app\n' } },
    { message: 'drop app', files: { 'app.ts': null }, parent: 0 },
  ]);

  const parent = await ctx.readGit(repo.path, ['rev-parse', `${repo.commits[2]}^`]);
  const tree = await ctx.readGit(repo.path, ['ls-tree', '--name-only', repo.commits[2] ?? '']);

  expect({ parent, tree }).toStrictEqual({ parent: `${repo.commits[0]}\n`, tree: '' });
});

test('it makes a merge commit with the further parents, holding the first parent tree and its files', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n' } },
    { message: 'add readme', files: { 'README.md': '# app\n' } },
    { message: 'drop app', files: { 'app.ts': null }, parent: 0 },
    { message: 'merge readme', files: { 'README.md': '# app\n' }, merged: 1 },
  ]);

  const parents = await ctx.readGit(repo.path, [
    'rev-list',
    '--parents',
    '-n',
    '1',
    repo.commits[3] ?? '',
  ]);

  const tree = await ctx.readGit(repo.path, ['ls-tree', '--name-only', repo.commits[3] ?? '']);

  expect({ parents, tree }).toStrictEqual({
    parents: `${repo.commits[3]} ${repo.commits[2]} ${repo.commits[1]}\n`,
    tree: 'README.md\n',
  });
});

test('it accepts several merged parents', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'root', files: { 'a.txt': 'a\n' } },
    { message: 'left', files: { 'b.txt': 'b\n' }, parent: 0 },
    { message: 'right', files: { 'c.txt': 'c\n' }, parent: 0 },
    { message: 'merge', files: {}, parent: 0, merged: [1, 2] },
  ]);

  const parents = await ctx.readGit(repo.path, [
    'rev-list',
    '--parents',
    '-n',
    '1',
    repo.commits[3] ?? '',
  ]);

  expect(parents).toBe(
    `${repo.commits[3]} ${repo.commits[0]} ${repo.commits[1]} ${repo.commits[2]}\n`,
  );
});

test('it never runs git merge, so a merge of commits that conflict has no conflict', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'root', files: { 'app.ts': 'one\n' } },
    { message: 'left', files: { 'app.ts': 'left\n' }, parent: 0 },
    { message: 'right', files: { 'app.ts': 'right\n' }, parent: 0 },
    { message: 'merge', files: { 'app.ts': 'resolved\n' }, parent: 1, merged: 2 },
  ]);

  const content = await ctx.readGit(repo.path, ['show', `${repo.commits[3]}:app.ts`]);

  expect(content).toBe('resolved\n');
});

test('it points main and HEAD at the last commit, with the work tree and index matching it', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n', 'old.txt': 'stale\n' } },
    { message: 'tidy', files: { 'old.txt': null, 'src/new.txt': 'fresh\n' } },
  ]);

  const main = await ctx.readGit(repo.path, ['rev-parse', 'main']);
  const head = await ctx.readGit(repo.path, ['rev-parse', 'HEAD']);
  const branch = await ctx.readGit(repo.path, ['symbolic-ref', '--short', 'HEAD']);
  const status = await ctx.readGit(repo.path, ['status', '--porcelain']);

  expect({
    main,
    head,
    branch,
    status,
    files: readdirSync(repo.path).toSorted(),
    content: readFileSync(join(repo.path, 'src/new.txt'), 'utf8'),
  }).toStrictEqual({
    main: `${repo.commits[1]}\n`,
    head: `${repo.commits[1]}\n`,
    branch: 'main\n',
    status: '',
    files: ['.git', 'app.ts', 'src'],
    content: 'fresh\n',
  });
});

test('it writes a symlink entry as a link', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'link', files: { 'app.json': '{}\n', current: { symlink: 'app.json' } } },
  ]);

  expect({
    isLink: lstatSync(join(repo.path, 'current')).isSymbolicLink(),
    target: readlinkSync(join(repo.path, 'current')),
  }).toStrictEqual({ isLink: true, target: 'app.json' });
});

test('it gives the same shas on each run for the same commits', async () => {
  const ctx = setupTest();

  const commits = [
    { message: 'add app', files: { 'app.ts': 'export {};\n' } },
    { message: 'add readme', files: { 'README.md': '# app\n' }, date: '2026-01-02T00:00:00Z' },
  ];

  const first = await createGitRepo(ctx.env, commits);
  const second = await createGitRepo(ctx.env, commits);

  expect(first.commits).toStrictEqual(second.commits);
});

test('it sets the author and committer date to the date of the commit, 2026-01-01 when unset', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n' } },
    { message: 'add readme', files: { 'README.md': '# app\n' }, date: '2026-01-02T03:04:05Z' },
  ]);

  const dates = await ctx.readGit(repo.path, ['log', '--reverse', '--format=%aI %cI']);

  expect(dates).toBe(
    '2026-01-01T00:00:00Z 2026-01-01T00:00:00Z\n2026-01-02T03:04:05Z 2026-01-02T03:04:05Z\n',
  );
});

test('it throws on an empty commit list', () => {
  const ctx = setupTest();

  expect(createGitRepo(ctx.env, [])).rejects.toThrow('at least one commit');
});

test('it removes the repo and rethrows when a commit fails', () => {
  const ctx = setupTest();
  const prefix = readRunFolderPrefix('repo');
  const before = readdirSync(tmpdir()).filter((entry) => entry.startsWith(prefix));

  const failure = createGitRepo(ctx.env, [
    { message: 'add app', files: { 'app.ts': 'export {};\n' } },
    { message: 'bad parent', files: {}, parent: 7 },
  ]);

  expect(failure).rejects.toThrow('names parent 7');

  const after = readdirSync(tmpdir()).filter((entry) => entry.startsWith(prefix));

  expect(after).toStrictEqual(before);
});

test('it removes the repo after the test', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [{ message: 'add app', files: { 'app.ts': 'x\n' } }]);

  onTestFinished(() => {
    expect(existsSync(repo.path)).toBeFalse();
  });
});

test('it leaves the repo in place after the test with cleanup manual', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [{ message: 'add app', files: { 'app.ts': 'x\n' } }], {
    cleanup: 'manual',
  });

  onTestFinished(() => {
    const isThere = existsSync(repo.path);

    repo.remove();

    expect(isThere).toBeTrue();
  });
});

test('it ignores the config of the user, so a commit is signed by nothing and named by the env', async () => {
  const ctx = setupTest();

  const repo = await createGitRepo(ctx.env, [{ message: 'add app', files: { 'app.ts': 'x\n' } }]);
  const author = await ctx.readGit(repo.path, ['log', '-1', '--format=%an <%ae> %G?']);

  expect(author).toBe('Test <test@example.com> N\n');
});
