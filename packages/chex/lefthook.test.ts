import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { collectFailedHookJobs } from '../../test-utils/collect-failed-hook-jobs.ts';
import type { ChexBaselineFixture } from '../../test-utils/create-chex-baseline-repo.ts';
import { createChexBaselineRepo } from '../../test-utils/create-chex-baseline-repo.ts';
import { readCallLog } from '../../test-utils/read-call-log.ts';
import { writeStubPrograms } from '../../test-utils/write-stub-programs.ts';

// Bun's skipIf takes a boolean at collection time. A host without actionlint skips the test that
// needs it, as the hook skips the check there; CI installs actionlint, so a CI run without it fails.
const canRunActionlint = Bun.which('actionlint') !== null || process.env['CI'] === 'true';

// Every git call gets a clean environment, so a GIT_DIR this test inherits from a real hook cannot
// reach the repo it runs in.
async function setupTest() {
  const packageRoot = import.meta.dir;
  const repoRoot = join(packageRoot, '../..');

  const directory = await mkdtemp(join(tmpdir(), 'chex-lefthook-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const bin = join(directory, 'bin');

  await mkdir(bin);

  // `bun run` puts the repo's node_modules/.bin on the PATH, where bun x would find this repo's own
  // chex, rig and diet in place of the ones the fixture installs.
  const searchPath = (process.env['PATH'] ?? '')
    .split(':')
    .filter((entry) => !entry.endsWith('node_modules/.bin'))
    .join(':');

  const env = {
    PATH: `${bin}:${searchPath}`,
    HOME: directory,

    // mise finds its config and tools under HOME, so under a fake HOME its node and actionlint shims
    // fail; the real config is also global, which mise trusts without a prompt.
    MISE_CONFIG_DIR:
      process.env['MISE_CONFIG_DIR'] ??
      join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'mise'),
    MISE_DATA_DIR:
      process.env['MISE_DATA_DIR'] ??
      join(process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local/share'), 'mise'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  const main = join(directory, 'main');
  const worktree = join(directory, 'worktree');
  const rigCalls = join(directory, 'rig-calls');

  await $`git init --quiet --bare --initial-branch=main ${join(directory, 'upstream.git')}`
    .cwd(directory)
    .env(env);

  await $`git init --quiet --initial-branch=main ${main}`.cwd(directory).env(env);
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(main).env(env);
  await $`git remote add origin ${join(directory, 'upstream.git')}`.cwd(main).env(env);
  await $`git push --quiet -u origin main`.cwd(main).env(env);
  await $`git worktree add --quiet -b feature ${worktree}`.cwd(main).env(env);

  const lefthook = join(repoRoot, 'node_modules/.bin/lefthook');

  await writeStubPrograms(join(main, '.git/hooks'), {
    'pre-push': `exec ${process.execPath} ${lefthook} run pre-push "$@"`,
    'pre-commit': `exec ${process.execPath} ${lefthook} run pre-commit "$@"`,
  });

  const writeRepo = (root: string, fixture?: Readonly<ChexBaselineFixture>) =>
    createChexBaselineRepo(root, { toolsRoot: repoRoot, rigLog: rigCalls }, fixture);

  const commitAll = async (root: string, message: string) => {
    await $`git add -A`.cwd(root).env(env);
    await $`git commit --quiet -m ${message}`.cwd(root).env(env);
  };

  const push = async (ref = 'feature', pushEnv: Readonly<Record<string, string>> = env) => {
    const result = await $`git push origin ${ref}`.cwd(worktree).env(pushEnv).nothrow().quiet();

    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    const failedJobs = collectFailedHookJobs(output);

    return { exitCode: result.exitCode, output, failedJobs };
  };

  const readRigCalls = () => readCallLog(rigCalls);

  return {
    directory,
    repoRoot,
    env,
    bin,
    main,
    worktree,
    writeRepo,
    commitAll,
    push,
    readRigCalls,
  };
}

test('it runs the related tests through rig under diet, and leaves the main checkout non-bare in a pre-push from a worktree', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, {
    rig: 'git init --quiet sandbox',
    files: { 'fixture.ts': 'export {};\n' },
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();
  const bare = await $`git config --get core.bare`.cwd(ctx.main).env(ctx.env).text();
  const rigCalls = await ctx.readRigCalls();

  expect({
    exitCode: result.exitCode,
    bare,
    sandbox: existsSync(join(ctx.worktree, 'sandbox/.git')),
    rigCalls,
  }).toStrictEqual({
    exitCode: 0,
    bare: 'false\n',
    sandbox: true,
    rigCalls: ['under diet: related fixture.ts'],
  });
});

test('it runs each repo check through chex and prints that it cleared', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, {
    realChecks: ['uncommitted', 'commits', 'local-paths', 'test-timeouts', 'dependency-gates'],
    files: { 'notes.txt': 'The kettle boils.\n' },
  });

  await ctx.commitAll(ctx.worktree, 'docs: add the notes');

  const result = await ctx.push();

  expect(result.exitCode).toBe(0);

  expect(
    [...result.output.matchAll(/^(?:cleared|bounced): \S+$/gmu)].map((line) => line[0]),
  ).toStrictEqual([
    'cleared: uncommitted',
    'cleared: commits',
    'cleared: local-paths',
    'cleared: test-timeouts',
    'cleared: dependency-gates',
  ]);
});

test('it fails the push on the uncommitted job and names the file when a file the branch changes holds an uncommitted change', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, {
    realChecks: ['uncommitted'],
    files: { 'guide.md': '# Guide\n\nA draft that runs too long.\n' },
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  // The fixed copy stays on disk, uncommitted, as the push sends the draft.
  await writeFile(join(ctx.worktree, 'guide.md'), '# Guide\n\nA short copy.\n');

  const result = await ctx.push();

  expect(result.exitCode).not.toBe(0);
  expect(result.failedJobs).toStrictEqual(['uncommitted']);
  expect(result.output).toMatch(/^guide\.md$/mu);
  expect(result.output).toMatch(/^bounced: uncommitted$/mu);
});

test('it passes the push when only a file the branch leaves unchanged holds an uncommitted change', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.main, 'notes.md'), '# Notes\n');

  await ctx.commitAll(ctx.main, 'docs: add the notes');
  await $`git push --quiet origin main`.cwd(ctx.main).env(ctx.env);
  await $`git merge --quiet main`.cwd(ctx.worktree).env(ctx.env);

  await ctx.writeRepo(ctx.worktree, {
    realChecks: ['uncommitted'],
    files: { 'guide.md': '# Guide\n' },
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  await writeFile(join(ctx.worktree, 'notes.md'), '# Notes, edited\n');

  const result = await ctx.push();

  expect(result.exitCode).toBe(0);
  expect(result.output).toMatch(/^cleared: uncommitted$/mu);
});

test('it fails the push and downloads nothing when the repo does not install chex', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree);

  await rm(join(ctx.worktree, 'node_modules/.bin/chex'));

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();

  expect(result.exitCode).not.toBe(0);
  expect(result.failedJobs[0]).toBe('uncommitted');

  expect(result.output).toInclude(
    "Could not find an existing 'chex' binary to run. Stopping because --no-install was passed.",
  );
});

test('it lints the files the branch changes with plain oxlint', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, {
    files: { 'src/kettle.ts': 'export {};\n' },
    oxlint: `echo "$*" > ${join(ctx.directory, 'oxlint-args')}`,
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();
  const args = await readFile(join(ctx.directory, 'oxlint-args'), 'utf8');

  expect({ exitCode: result.exitCode, args }).toStrictEqual({
    exitCode: 0,
    args: '--no-error-on-unmatched-pattern src/kettle.ts\n',
  });
});

test('it fails the push on the shell job alone when a shell file the branch changes fails shellcheck', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, { files: { 'bad.sh': '#!/usr/bin/env bash\necho $1\n' } });
  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();

  expect(result.exitCode).not.toBe(0);
  expect(result.failedJobs).toStrictEqual(['shell']);
  expect(result.output).toInclude('SC2086');
});

test('it passes the push with a notice when the machine lacks shfmt', async () => {
  const ctx = await setupTest();

  for (const program of ['git', 'sh', 'shellcheck', 'env']) {
    const found = Bun.which(program);

    invariant(found !== null, `install ${program}`);

    await symlink(found, join(ctx.bin, program));
  }

  await symlink(process.execPath, join(ctx.bin, 'bun'));

  await ctx.writeRepo(ctx.worktree, { files: { 'bad.sh': '#!/usr/bin/env bash\necho $1\n' } });
  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push('feature', { ...ctx.env, PATH: ctx.bin });

  expect(result.exitCode).toBe(0);

  expect(result.output).toInclude(
    'shell: skipped, because shfmt is not on the PATH; CI runs the check',
  );
});

test("it runs the docs checks that the repo's check:docs script names, and fails the push when one bounces", async () => {
  const ctx = await setupTest();

  // The root README holds 100 lines at most; this one has 101, each a list item.
  const lines = Array.from(
    { length: 100 },
    (_, index) => `- Step ${index + 1} greets the visitor.`,
  );

  await ctx.writeRepo(ctx.worktree, {
    realChecks: ['length', 'links'],
    scripts: { 'check:docs': 'chex length links' },
    files: { 'README.md': `# Greeter\n${lines.join('\n')}\n` },
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();

  expect(result.failedJobs).toStrictEqual(['docs']);
  expect(result.output).toInclude('README.md: 101 lines, over the front page README limit of 100');
  expect(result.output).toMatch(/^bounced: length$/mu);
  expect(result.output).toMatch(/^cleared: links$/mu);
});

test('it fails the docs job of a repo with no check:docs script, since the repo names its docs checks', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, { files: { 'README.md': '# Greeter\n' } });

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({ scripts: { 'format:check': 'true', typecheck: 'true' } }),
  );

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();

  expect(result.failedJobs).toStrictEqual(['docs']);
});

test('it passes the push with a notice when the machine lacks actionlint, and runs the workflow lint', async () => {
  const ctx = await setupTest();

  for (const program of ['git', 'sh', 'env', 'date']) {
    const found = Bun.which(program);

    invariant(found !== null, `install ${program}`);

    await symlink(found, join(ctx.bin, program));
  }

  await symlink(process.execPath, join(ctx.bin, 'bun'));

  await ctx.writeRepo(ctx.worktree, {
    realChecks: ['workflows'],
    files: { '.github/workflows/greet.yml': 'on: push\njobs: {}\n' },
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push('feature', { ...ctx.env, PATH: ctx.bin });

  expect(result.exitCode).toBe(0);

  expect(result.output).toInclude(
    'workflows: actionlint skipped, because it is not on the PATH; CI runs it',
  );

  expect(result.output).toMatch(/^cleared: workflows$/mu);
});

test.skipIf(!canRunActionlint)(
  'it fails the push on the workflows job when actionlint rejects a workflow the branch changes',
  async () => {
    const ctx = await setupTest();

    await ctx.writeRepo(ctx.worktree, {
      realChecks: ['workflows'],
      files: { '.github/workflows/greet.yml': 'on: push\njobs:\n  greet:\n    steps: []\n' },
    });

    await ctx.commitAll(ctx.worktree, 'test: add the fixture');

    const result = await ctx.push();

    expect(result.failedJobs).toStrictEqual(['workflows']);
    expect(result.output).toInclude('"runs-on" section is missing in job "greet"');
  },
);

test('it fails the push when a commit of the branch fails commitlint', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, { realChecks: ['commits'], withCommitlint: true });
  await ctx.commitAll(ctx.worktree, 'tidy up');

  const result = await ctx.push();

  expect(result.failedJobs).toStrictEqual(['commits']);
  expect(result.output).toInclude('subject may not be empty [subject-empty]');
  expect(result.output).toMatch(/^bounced: commits$/mu);
});

test('it fails a push of another branch when that branch adds the home directory', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, { realChecks: ['local-paths'] });
  await ctx.commitAll(ctx.worktree, 'test: add the hook config');
  await $`git switch --quiet -c cache-notes`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'cache.txt'), `cache: ${ctx.env.HOME}/.cache\n`);

  await ctx.commitAll(ctx.worktree, 'docs: note the cache folder');
  await $`git switch --quiet feature`.cwd(ctx.worktree).env(ctx.env);

  const result = await ctx.push('cache-notes');

  expect(result.failedJobs).toStrictEqual(['local-paths']);
  expect(result.output).toInclude('cache.txt:1: commit ');
});

test('it fails the push when a bunfig.toml raises the test timeout above 5 s', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, {
    realChecks: ['test-timeouts'],
    files: { 'bunfig.toml': '[test]\ntimeout = 20000\n' },
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();

  expect(result.failedJobs).toStrictEqual(['test-timeouts']);
  expect(result.output).toMatch(/^bounced: test-timeouts$/mu);
});

test('it fails the push when bunfig.toml holds an age-gate exclude past its removal date', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, {
    realChecks: ['dependency-gates'],
    files: {
      'bunfig.toml': [
        '[install]',
        '# left-pad 1.3.1 (published 2020-03-01, patches GHSA-aaaa-bbbb-cccc) ages past the gate ~2020-03-08 — remove then (audit-fix)',
        'minimumReleaseAgeExcludes = ["left-pad"]',
      ].join('\n'),
    },
  });

  await ctx.commitAll(ctx.worktree, 'test: add the fixture');

  const result = await ctx.push();

  expect(result.failedJobs).toStrictEqual(['dependency-gates']);
  expect(result.output).toInclude('left-pad');
});

test("it fails the commit when typecheck fails, after the repo's own pre-commit job runs", async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, {
    scripts: { typecheck: 'echo typecheck >> ran.txt && exit 1' },
    files: {
      'lefthook.yml':
        'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\npre-commit:\n  jobs:\n    - name: fixer\n      run: echo fixer >> ran.txt\n',
      'fixture.ts': 'export {};\n',
    },
  });

  await $`git add lefthook.yml fixture.ts package.json .gitignore`.cwd(ctx.worktree).env(ctx.env);

  const result = await $`git commit -m ${'test: add the fixture'}`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const ran = await readFile(join(ctx.worktree, 'ran.txt'), 'utf8');

  expect({ exitCode: result.exitCode, ran }).toStrictEqual({
    exitCode: 1,
    ran: 'fixer\ntypecheck\n',
  });
});

test('it skips typecheck on a commit that stages no code or config file', async () => {
  const ctx = await setupTest();

  await ctx.writeRepo(ctx.worktree, { scripts: { typecheck: 'exit 1' } });
  await $`git add lefthook.yml .gitignore`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'notes.md'), '# Notes\n');

  await $`git add notes.md`.cwd(ctx.worktree).env(ctx.env);

  const result = await $`git commit -m ${'docs: add the notes'}`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

// Each suite that spawns git must stay safe without the baseline's env -u, so the tests in it whose
// code under test runs git run here with the GIT_DIR a pre-push hook in the worktree exports. The
// filter keeps each nested run inside the per-test timeout.
test.each([
  ['packages/oxfmt-config/index.test.ts', 'repo-sync delivers'],
  ['packages/chex/src/read-branch-base.test.ts', 'merge base'],
  [
    'packages/chex/src/run-commits-check.test.ts',
    'reads only the commits after the base|leaves out a merge commit',
  ],
  [
    'packages/chex/src/run-local-paths-check.test.ts',
    'reads only the lines the branch adds|a later commit of the branch removes',
  ],
  ['packages/chex/src/run-test-timeouts-check.test.ts', 'as HEAD holds them'],
  ['packages/chex/src/run-workflows-check.test.ts', 'as HEAD holds it|no commit'],
  ['packages/chex/src/docs/check-prose.test.ts', 'linguist-vendored'],
  ['packages/chex/src/docs/check-links.test.ts', 'linguist-vendored'],
  ['packages/chex/src/docs/check-skill.test.ts', 'linguist-vendored'],
  ['packages/chex/src/docs/check-readmes.test.ts', 'linguist-vendored'],
])(
  'it passes the git tests of %s that match %p and leaves the main checkout config and branch unchanged under a worktree GIT_DIR',
  async (suite, pattern) => {
    const ctx = await setupTest();

    // A local exclude for every page, so a script whose git reads this repo instead of its own
    // temp repo lists none of the pages its test writes, and the test fails.
    await writeFile(join(ctx.main, '.git/info/exclude'), '*.md\n');

    const config = await readFile(join(ctx.main, '.git/config'), 'utf8');
    const head = await $`git rev-parse feature`.cwd(ctx.main).env(ctx.env).text();

    // The real HOME, so a tool on PATH that reads it, such as a version manager's node shim, runs.
    const result = await $`bun test ./${suite} -t ${pattern}`
      .cwd(ctx.repoRoot)
      .env({
        ...ctx.env,
        HOME: process.env['HOME'],
        GIT_DIR: join(ctx.main, '.git/worktrees/worktree'),
      })
      .quiet()
      .nothrow();

    const configAfter = await readFile(join(ctx.main, '.git/config'), 'utf8');
    const headAfter = await $`git rev-parse feature`.cwd(ctx.main).env(ctx.env).text();

    expect(configAfter).toBe(config);
    expect(headAfter).toBe(head);
    expect(result.stderr.toString()).toMatch(/^ [1-9]\d* pass\n \d+ filtered out\n 0 fail$/mu);
    expect(result.exitCode).toBe(0);
  },
);
