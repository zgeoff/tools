import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { buildTextWithBlobPrefix } from '../../test-utils/build-text-with-blob-prefix.ts';
import { runLocalPathsCheck } from './run-local-paths-check.ts';
import { runProgram } from './run-program.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-local-paths-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  await $`git init --quiet`.cwd(directory).env(env);

  return { directory, env };
}

test('it passes a branch whose added lines hold no local path', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(
    join(ctx.directory, 'greet.txt'),
    'cache: ~/.cache/greeting\nhost: example.com\n',
  );

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([]);
});

test('it reports an added line that holds the home directory at its path and line', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(
    join(ctx.directory, 'greet.txt'),
    `greeting: hello\ncache: ${ctx.directory}/.cache/greeting\n`,
  );

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: 'greet.txt',
      line: 2,
      message: `commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push`,
    },
  ]);
});

test('it reports an added line that holds the host name as a whole word', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(join(ctx.directory, 'greet.txt'), `built on greeter-box, at noon\n`);

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: 'greet.txt',
      line: 1,
      message: `commit ${hashText.trim()} adds the host name greeter-box; remove it before you push`,
    },
  ]);
});

test('it passes the host name inside a longer word', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(join(ctx.directory, 'greet.txt'), `the greeter-box_backup and xgreeter-box\n`);

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([]);
});

test.each([
  ['an empty host name', ''],
  ['the host name localhost', 'localhost'],
])('it reads no host in a line when the machine has %s', async (_label, host) => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(join(ctx.directory, 'greet.txt'), 'serve on localhost, port 8080\n');

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host,
  });

  expect(findings).toStrictEqual([]);
});

test('it reads only the lines the branch adds, not the lines it keeps or removes', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'greet.txt'),
    `greeting: hello\ncache: ${ctx.directory}/.cache/greeting\nhost: greeter-box\n`,
  );

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(
    join(ctx.directory, 'greet.txt'),
    `greeting: good day\ncache: ${ctx.directory}/.cache/greeting\n`,
  );

  await $`git commit --quiet -am ${'fix: change the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([]);
});

test('it reports a line that a later commit of the branch removes', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(join(ctx.directory, 'greet.txt'), `cache: ${ctx.directory}/.cache/greeting\n`);

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(join(ctx.directory, 'greet.txt'), 'cache: ~/.cache/greeting\n');

  await $`git commit --quiet -am ${'fix: drop the local path'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: 'greet.txt',
      line: 1,
      message: `commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push`,
    },
  ]);
});

test('it reports nothing for a file that the branch only renames', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'greet.txt'), `cache: ${ctx.directory}/.cache/greeting\n`);

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git mv greet.txt welcome.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'refactor: rename the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([]);
});

test('it reads no home directory when HOME is the root folder', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(join(ctx.directory, 'greet.txt'), 'docs: https://example.com/greeting\n');

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: { ...ctx.env, HOME: '/' },
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([]);
});

test('it reports a line that a merge adds when it resolves a conflict', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'greet.txt'), 'greeting: hello\n');

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: start the repo'}`.cwd(ctx.directory).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git switch --quiet -c side`.cwd(ctx.directory).env(ctx.env);

  await writeFile(join(ctx.directory, 'greet.txt'), 'greeting: good day\n');

  await $`git commit --quiet -am ${'feat: greet by day'}`.cwd(ctx.directory).env(ctx.env);
  await $`git switch --quiet -`.cwd(ctx.directory).env(ctx.env);

  await writeFile(join(ctx.directory, 'greet.txt'), 'greeting: good evening\n');

  await $`git commit --quiet -am ${'feat: greet by evening'}`.cwd(ctx.directory).env(ctx.env);
  await $`git merge --quiet side`.cwd(ctx.directory).env(ctx.env).nothrow().quiet();

  await writeFile(join(ctx.directory, 'greet.txt'), `greeting: ${ctx.directory}/.cache/greeting\n`);

  await $`git commit --quiet -am ${'Merge the greetings'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: 'greet.txt',
      line: 1,
      message: `commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push`,
    },
  ]);
});

test('it reports a line that a conflict-resolving merge adds in a blobless clone', async () => {
  const ctx = await setupTest();

  const origin = join(ctx.directory, 'origin');
  const clone = join(ctx.directory, 'clone');

  await $`git init --quiet ${origin}`.env(ctx.env);
  await $`git config uploadpack.allowFilter true`.cwd(origin).env(ctx.env);
  await $`git config core.abbrev 12`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'greet.txt'), 'greeting: hello\n');

  await $`git add greet.txt`.cwd(origin).env(ctx.env);
  await $`git commit --quiet -m ${'chore: start the repo'}`.cwd(origin).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(origin).env(ctx.env).text();

  await $`git switch --quiet -c side`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'greet.txt'), 'greeting: good day\n');

  await $`git commit --quiet -am ${'feat: greet by day'}`.cwd(origin).env(ctx.env);
  await $`git switch --quiet -`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'greet.txt'), 'greeting: good evening\n');

  await $`git commit --quiet -am ${'feat: greet by evening'}`.cwd(origin).env(ctx.env);
  await $`git merge --quiet side`.cwd(origin).env(ctx.env).nothrow().quiet();

  await writeFile(join(origin, 'greet.txt'), `greeting: ${ctx.directory}/.cache/greeting\n`);

  await $`git commit --quiet -am ${'Merge the greetings'}`.cwd(origin).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(origin).env(ctx.env).text();

  const remergeText = await $`git show --diff-merges=remerge --full-index --format= HEAD`
    .cwd(origin)
    .env(ctx.env)
    .text();

  const conflictBlob =
    /^index (?<blob>[0-9a-f]{40})\.\./mu.exec(remergeText)?.groups?.['blob'] ?? '';

  // git's loose-object cache lists each 2-hex folder once, so a later merge that looks up a blob
  // in the conflict blob's folder hides that blob from the prefetch, which asks the server for it.
  const farewell = buildTextWithBlobPrefix('farewell: goodbye', conflictBlob.slice(0, 2));

  await $`git switch --quiet -c notes`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'notes.txt'), 'note: be kind\n');

  await $`git add notes.txt`.cwd(origin).env(ctx.env);
  await $`git commit --quiet -m ${'docs: add a note'}`.cwd(origin).env(ctx.env);
  await $`git switch --quiet -`.cwd(origin).env(ctx.env);
  await $`git merge --quiet --no-ff --no-commit notes`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'farewell.txt'), farewell);

  await $`git add farewell.txt`.cwd(origin).env(ctx.env);
  await $`git commit --quiet -m ${'Merge the notes'}`.cwd(origin).env(ctx.env);

  await $`git clone --quiet --no-checkout --filter=blob:none ${`file://${origin}`} ${clone}`.env(
    ctx.env,
  );

  await $`git config core.abbrev 12`.cwd(clone).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: clone,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: 'greet.txt',
      line: 1,
      message: `commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push`,
    },
  ]);
});

test('it passes a blobless clone whose unpushed merge holds blobs the server lacks', async () => {
  const ctx = await setupTest();

  const origin = join(ctx.directory, 'origin');
  const clone = join(ctx.directory, 'clone');

  await $`git init --quiet ${origin}`.env(ctx.env);
  await $`git config uploadpack.allowFilter true`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'greet.txt'), 'greeting: hello\n');
  await writeFile(join(origin, 'farewell.txt'), 'farewell: goodbye\n');

  await $`git add greet.txt farewell.txt`.cwd(origin).env(ctx.env);
  await $`git commit --quiet -m ${'chore: start the repo'}`.cwd(origin).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(origin).env(ctx.env).text();

  await $`git switch --quiet -c side`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'farewell.txt'), 'farewell: see you\n');

  await $`git commit --quiet -am ${'feat: say see you'}`.cwd(origin).env(ctx.env);
  await $`git switch --quiet -`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'greet.txt'), 'greeting: good evening\n');

  await $`git commit --quiet -am ${'feat: greet by evening'}`.cwd(origin).env(ctx.env);
  await $`git clone --quiet --filter=blob:none ${`file://${origin}`} ${clone}`.env(ctx.env);

  await writeFile(join(clone, 'greet.txt'), 'greeting: good night\n');

  await $`git commit --quiet -am ${'feat: greet by night'}`.cwd(clone).env(ctx.env);
  await $`git merge --quiet --no-edit origin/side`.cwd(clone).env(ctx.env);

  const findings = runLocalPathsCheck({
    cwd: clone,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([]);
});

test('it throws the fetch error when a blobless clone cannot reach its origin for merge blobs', async () => {
  const ctx = await setupTest();

  const origin = join(ctx.directory, 'origin');
  const clone = join(ctx.directory, 'clone');

  await $`git init --quiet ${origin}`.env(ctx.env);
  await $`git config uploadpack.allowFilter true`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'greet.txt'), 'greeting: hello\n');

  await $`git add greet.txt`.cwd(origin).env(ctx.env);
  await $`git commit --quiet -m ${'chore: start the repo'}`.cwd(origin).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(origin).env(ctx.env).text();

  await $`git switch --quiet -c side`.cwd(origin).env(ctx.env);

  await writeFile(join(origin, 'farewell.txt'), 'farewell: goodbye\n');

  await $`git add farewell.txt`.cwd(origin).env(ctx.env);
  await $`git commit --quiet -m ${'feat: say goodbye'}`.cwd(origin).env(ctx.env);
  await $`git switch --quiet -`.cwd(origin).env(ctx.env);
  await $`git merge --quiet --no-ff --no-edit side`.cwd(origin).env(ctx.env);

  await $`git clone --quiet --no-checkout --filter=blob:none ${`file://${origin}`} ${clone}`.env(
    ctx.env,
  );

  await $`git remote set-url origin ${`file://${join(ctx.directory, 'no-such-origin')}`}`
    .cwd(clone)
    .env(ctx.env);

  expect(() =>
    runLocalPathsCheck({
      cwd: clone,
      runProgram,
      base: baseText.trim(),
      env: ctx.env,
      host: 'greeter-box',
    }),
  ).toThrow(
    /^git -c fetch\.negotiationAlgorithm=noop fetch --quiet --no-tags --no-write-fetch-head --filter=blob:none --stdin origin failed: fatal: '[^']*no-such-origin' does not appear to be a git repository/u,
  );
});

test('it reports the real path of a file whose name git quotes', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(
    join(ctx.directory, 'odd\tname "q" back\\slash.txt'),
    `cache: ${ctx.directory}/.cache\n`,
  );

  await $`git add -A`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the odd file'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: 'odd\tname "q" back\\slash.txt',
      line: 1,
      message: `commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push`,
    },
  ]);
});

test('it reports the real path of a quoted file name that holds an emoji', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await writeFile(join(ctx.directory, '😀\tnotes.txt'), `cache: ${ctx.directory}/.cache\n`);

  await $`git add -A`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the notes'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: '😀\tnotes.txt',
      line: 1,
      message: `commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push`,
    },
  ]);
});

test('it reports the right line when the repo joins nearby hunks with diff.interHunkContext', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'greet.txt'), 'a\nb\nc\nd\ne\n');

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: start the repo'}`.cwd(ctx.directory).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git config diff.interHunkContext 10`.cwd(ctx.directory).env(ctx.env);

  await writeFile(join(ctx.directory, 'greet.txt'), `a\nB\nc\nd\n${ctx.directory}/e\n`);

  await $`git commit --quiet -am ${'feat: change the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const findings = runLocalPathsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    host: 'greeter-box',
  });

  expect(findings).toStrictEqual([
    {
      path: 'greet.txt',
      line: 5,
      message: `commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push`,
    },
  ]);
});

test('it prints each finding at its path and line and exits 1 when run as a script', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await writeFile(join(ctx.directory, 'greet.txt'), `cache: ${ctx.directory}/.cache\n`);

  await $`git add greet.txt`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the greeting'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-local-paths-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: `greet.txt:1: commit ${hashText.trim()} adds the home directory ${ctx.directory}/; remove it before you push\n`,
  });
});

test('it exits 2 and names the missing base when run as a script in a repo with no remote', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-local-paths-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 2,
    stderr:
      'local-paths: cannot find the base of this branch: no merge base between HEAD and origin/main (is the remote fetched?)\n',
  });
});

test('it throws the git log error when the base is not a commit', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  expect(() =>
    runLocalPathsCheck({
      cwd: ctx.directory,
      runProgram,
      base: 'no-such-greeting',
      env: ctx.env,
      host: 'greeter-box',
    }),
  ).toThrow(/^git log failed: fatal: ambiguous argument 'no-such-greeting\.\.HEAD'/u);
});
