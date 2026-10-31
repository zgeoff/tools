import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { createSideGitCommit } from '../../test-utils/create-side-git-commit.ts';
import { createStubPullRequestGH } from '../../test-utils/create-stub-pull-request-gh.ts';
import { createTrackedGitCommit } from '../../test-utils/create-tracked-git-commit.ts';
import { moveGitCommitToRemote } from '../../test-utils/move-git-commit-to-remote.ts';
import { readGitHead } from '../../test-utils/read-git-head.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import { syncEntries } from './sync-entries.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-sync-entries-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(import.meta.dir, '..', '..');
  const origin = join(directory, 'origin.git');
  const tools = join(directory, 'tools');
  const bin = join(directory, 'bin');
  const state = join(directory, 'pulls.json');
  const seed = join(directory, 'seed');

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  await mkdir(bin);
  await createStubPullRequestGH(bin, state);

  // The tools checkout holds the shell scripts the sync runs, as the code under test.
  await mkdir(join(tools, 'scripts'), { recursive: true });

  await cp(
    join(root, 'scripts', 'remove-excluded-blocks.sh'),
    join(tools, 'scripts', 'remove-excluded-blocks.sh'),
  );

  await cp(
    join(root, 'scripts', 'remove-retired-sync-files.sh'),
    join(tools, 'scripts', 'remove-retired-sync-files.sh'),
  );

  await $`git -C ${tools} init -q`.env(env).quiet();
  await $`git init -q --bare -b main ${origin}`.env(env);
  await $`git clone -q ${origin} ${seed}`.env(env).quiet();

  const output: string[] = [];

  // Runs the sync job's step in a fresh clone of the caller, with the env the step sets.
  // Commits the tools sources and marks the commit as main, so the run syncs from a commit on main.
  const writeToolsCommit = () => createTrackedGitCommit(tools, env, {});

  // Commits the manifest on a side branch of the tools checkout and returns to main, so the commit
  // exists and main never holds it.
  const writeSideCommit = (manifest: unknown[]) =>
    createSideGitCommit(tools, env, {
      branch: 'side',
      files: { 'sync/manifest.json': JSON.stringify(manifest) },
    });

  // The afterClone callback runs between the caller's checkout and the sync, as a merge that lands
  // while the run waits in its queue does.
  const runSync = async (
    entries: unknown[],
    extraEnv: Readonly<Record<string, string>> = {},
    afterClone: () => Promise<void> = () => Promise.resolve(),
  ) => {
    const toolsRef = await writeToolsCommit();
    const caller = await mkdtemp(join(directory, 'caller-'));

    await $`git clone -q ${origin} ${caller}`.env(env).quiet();

    await afterClone();
    await cp(tools, join(caller, '.repo-sync'), { recursive: true });

    return syncEntries({
      fileSystem: nodeFileSystem,
      runCommand,
      runLoggedCommand: runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
      cwd: caller,
      env: {
        ...env,
        PATH: `${bin}:${process.env['PATH']}`,
        ENTRIES: JSON.stringify(entries),
        BRANCH: 'repo-sync/zgeoff-tools',
        MARKER: 'repo-sync delivers this file from zgeoff/tools',
        TOOLS_REF: toolsRef,
        REPO: 'example/app',
        SKIP: '',
        BASE: 'main',
        ...extraEnv,
      },
    });
  };

  const writeSource = async (path: string, content: string) => {
    await mkdir(dirname(join(tools, path)), { recursive: true });
    await writeFile(join(tools, path), content);
  };

  const removeSource = async (path: string) => {
    await rm(join(tools, path));
  };

  const writeManifestCommit = async (manifest: unknown[]) => {
    await mkdir(join(tools, 'sync'), { recursive: true });
    await writeFile(join(tools, 'sync', 'manifest.json'), JSON.stringify(manifest));

    await $`git -C ${tools} add -A && git -C ${tools} commit -q -m ${'chore: change the manifest'}`
      .env(env)
      .quiet();
  };

  const readBranch = async (branch: string, path: string) => {
    const content = await $`git -C ${origin} show ${`${branch}:${path}`}`.text();

    return content;
  };

  const readBranchFiles = async (branch: string) => {
    const files = await $`git -C ${origin} ls-tree -r --name-only ${branch}`.text();

    return files.split('\n').filter((file) => file !== '');
  };

  const readToolsHead = () => readGitHead(tools, env);

  // Moves the commit to a remote of the tools checkout and drops it locally, so a run must fetch
  // it to know it.
  const writeRemoteOnlyCommit = (commit: string, keep: string) =>
    moveGitCommitToRemote(tools, env, {
      commit,
      keep,
      remote: join(directory, 'tools-remote.git'),
    });

  const readBranchHead = async (branch: string) => {
    const head = await $`git -C ${origin} rev-parse ${branch}`.text();

    return head.trim();
  };

  const readBranchNames = async () => {
    const refs =
      await $`git -C ${origin} for-each-ref ${'--format=%(refname:short)'} refs/heads`.text();

    return refs.split('\n').filter((name) => name !== '');
  };

  const readCommitSubjects = async (branch: string) => {
    const log = await $`git -C ${origin} log --reverse --format=%s main..${branch}`.text();

    return log.split('\n').filter((subject) => subject !== '');
  };

  const readCommitBodies = async (branch: string) => {
    const log = await $`git -C ${origin} log --reverse ${'--format=%b%x00'} main..${branch}`.text();

    return log
      .split('\0')
      .map((body) => body.trim())
      .slice(0, -1);
  };

  const readPullRequests = async () => {
    const pulls = await readFile(state, 'utf8');

    const parsed: unknown = JSON.parse(pulls);

    return parsed;
  };

  const writeMainCommit = async (path: string, content: string) => {
    await writeFile(join(seed, path), content);

    await $`git -C ${seed} add -A && git -C ${seed} commit -q -m init && git -C ${seed} push -q origin HEAD:main`
      .env(env)
      .quiet();
  };

  const writeBranch = async (branch: string, path: string, content: string) => {
    await $`git -C ${seed} checkout -q -B ${branch} origin/main`.env(env).quiet();

    await mkdir(dirname(join(seed, path)), { recursive: true });
    await writeFile(join(seed, path), content);

    await $`git -C ${seed} add -A && git -C ${seed} commit -q -m ${branch} && git -C ${seed} push -q -f origin ${`${branch}:${branch}`}`
      .env(env)
      .quiet();
  };

  return {
    origin,
    state,
    output,
    runSync,
    writeMainCommit,
    writeSource,
    writeManifestCommit,
    removeSource,
    readBranch,
    readBranchFiles,
    readBranchHead,
    readToolsHead,
    writeToolsCommit,
    writeSideCommit,
    writeRemoteOnlyCommit,
    readBranchNames,
    readCommitSubjects,
    readCommitBodies,
    readPullRequests,
    writeBranch,
  };
}

test('it opens one pull request that carries every changed file of every entry', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');
  await ctx.writeSource('sync/skills/demo/SKILL.md', '# Demo\n');
  await ctx.writeSource('sync/skills/demo/references/more.md', '# More\n');

  const exitCode = await ctx.runSync([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
    {
      name: 'skill-demo',
      description: 'The demo skill',
      files: [
        { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
        {
          source: 'sync/skills/demo/references/more.md',
          target: '.claude/skills/demo/references/more.md',
        },
      ],
    },
  ]);

  const branches = await ctx.readBranchNames();
  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const editorconfig = await ctx.readBranch('repo-sync/zgeoff-tools', '.editorconfig');
  const skill = await ctx.readBranch('repo-sync/zgeoff-tools', '.claude/skills/demo/SKILL.md');

  const reference = await ctx.readBranch(
    'repo-sync/zgeoff-tools',
    '.claude/skills/demo/references/more.md',
  );

  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();
  const commit = await ctx.readToolsHead();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main', 'repo-sync/zgeoff-tools']);

  expect(files).toStrictEqual([
    '.claude/skills/demo/SKILL.md',
    '.claude/skills/demo/references/more.md',
    '.editorconfig',
    'README.md',
  ]);

  expect(editorconfig).toBe('root = true\n');
  expect(skill).toBe('# Demo\n');
  expect(reference).toBe('# More\n');

  expect(subjects).toStrictEqual([
    'chore: sync editorconfig from zgeoff/tools',
    'chore: sync skill-demo from zgeoff/tools',
  ]);

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore(sync): update the editorconfig and the demo skill',
      body:
        `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n` +
        '- `editorconfig`: The editor config\n' +
        '- `skill-demo`: The demo skill',
      state: 'open',
      autoMerge: { method: 'squash', head },
    },
  ]);
});

test('it updates the open pull request when a later release syncs before it merges', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const entries = [
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
    {
      name: 'socket',
      description: 'The Socket config',
      files: [{ source: 'sync/socket.yml', target: 'socket.yml' }],
    },
  ];

  await ctx.writeSource('sync/editorconfig', 'root = true\n');
  await ctx.writeSource('sync/socket.yml', 'version: 2\n');
  await ctx.runSync(entries);
  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_style = space\n');

  const exitCode = await ctx.runSync(entries);
  const branches = await ctx.readBranchNames();
  const editorconfig = await ctx.readBranch('repo-sync/zgeoff-tools', '.editorconfig');
  const socket = await ctx.readBranch('repo-sync/zgeoff-tools', 'socket.yml');
  const pulls = await ctx.readPullRequests();
  const commit = await ctx.readToolsHead();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main', 'repo-sync/zgeoff-tools']);
  expect(editorconfig).toBe('root = true\n\n[*]\nindent_style = space\n');
  expect(socket).toBe('version: 2\n');

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore(sync): update the editorconfig and the socket',
      body:
        `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n` +
        '- `editorconfig`: The editor config\n' +
        '- `socket`: The Socket config',
      state: 'open',
      autoMerge: { method: 'squash', head },
    },
  ]);
});

test('it deletes the sync/<name> branch of each entry it syncs', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('sync/editorconfig', '.editorconfig', 'root = false\n');
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  await ctx.runSync([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ]);

  const branches = await ctx.readBranchNames();

  expect(branches).toStrictEqual(['main', 'repo-sync/zgeoff-tools']);
});

test('it deletes the sync branch and opens no pull request when every entry matches', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('repo-sync/zgeoff-tools', '.editorconfig', 'root = false\n');
  await ctx.writeSource('sync/readme.md', '# app\n');

  const exitCode = await ctx.runSync([
    {
      name: 'readme',
      description: 'The readme',
      files: [{ source: 'sync/readme.md', target: 'README.md' }],
    },
  ]);

  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main']);
  expect(pulls).toStrictEqual([]);
});

test('it leaves a failing entry out, syncs the others, and fails the run', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');
  await ctx.writeSource('sync/socket.yml', 'version: 2\n');

  const exitCode = await ctx.runSync([
    {
      name: 'socket',
      description: 'The Socket config',
      files: [{ source: 'sync/socket.yml', target: 'socket.yml' }],
      build: 'echo broken > socket.yml && exit 3',
    },
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ]);

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();
  const commit = await ctx.readToolsHead();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(1);
  expect(files).toStrictEqual(['.editorconfig', 'README.md']);
  expect(subjects).toStrictEqual(['chore: sync editorconfig from zgeoff/tools']);

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore(sync): update the editorconfig',
      body:
        `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n` +
        '- `editorconfig`: The editor config',
      state: 'open',
      autoMerge: { method: 'squash', head },
    },
  ]);
});

test('it keeps the sync/<name> branch of a failed entry and deletes the others', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('sync/socket', 'socket.yml', 'version: 1\n');
  await ctx.writeBranch('sync/editorconfig', '.editorconfig', 'root = false\n');
  await ctx.writeSource('sync/editorconfig', 'root = true\n');
  await ctx.writeSource('sync/socket.yml', 'version: 2\n');

  await ctx.runSync([
    {
      name: 'socket',
      description: 'The Socket config',
      files: [{ source: 'sync/socket.yml', target: 'socket.yml' }],
      build: 'exit 3',
    },
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ]);

  const branches = await ctx.readBranchNames();

  expect(branches).toStrictEqual(['main', 'repo-sync/zgeoff-tools', 'sync/socket']);
});

test('it keeps every sync/<name> branch when no pull request publishes', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('sync/readme', 'README.md', '# old app\n');
  await ctx.writeSource('sync/readme.md', '# app\n');
  await ctx.writeSource('sync/socket.yml', 'version: 2\n');

  const exitCode = await ctx.runSync([
    {
      name: 'socket',
      description: 'The Socket config',
      files: [{ source: 'sync/socket.yml', target: 'socket.yml' }],
      build: 'exit 3',
    },
    {
      name: 'readme',
      description: 'The readme',
      files: [{ source: 'sync/readme.md', target: 'README.md' }],
    },
  ]);

  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(1);
  expect(branches).toStrictEqual(['main', 'sync/readme']);
  expect(pulls).toStrictEqual([]);
});

test('it leaves out every file of an entry whose workflow conflicts, syncs the others, and fails the run', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('main', '.github/workflows/ci.yml', 'name: Own CI\n');
  await ctx.writeSource('sync/notes.md', '# Notes\n');
  await ctx.writeSource('sync/ci.yml', 'name: Shared CI\n');
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const exitCode = await ctx.runSync([
    {
      name: 'workflow-ci',
      description: 'The CI workflow',
      files: [
        { source: 'sync/notes.md', target: 'docs/notes.md' },
        { source: 'sync/ci.yml', target: '.github/workflows/ci.yml' },
      ],
    },
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ]);

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const workflow = await ctx.readBranch('repo-sync/zgeoff-tools', '.github/workflows/ci.yml');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(1);
  expect(files).toStrictEqual(['.editorconfig', '.github/workflows/ci.yml', 'README.md']);
  expect(workflow).toBe('name: Own CI\n');
  expect(subjects).toStrictEqual(['chore: sync editorconfig from zgeoff/tools']);
});

test('it keeps the sync branch and its pull request when every entry of a later release fails', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.writeSource('sync/editorconfig', 'root = true\n');
  await ctx.runSync([entry]);

  const commit = await ctx.readToolsHead();

  await ctx.writeSource('sync/editorconfig', 'root = false\n');

  const exitCode = await ctx.runSync([{ ...entry, build: 'exit 3' }]);
  const editorconfig = await ctx.readBranch('repo-sync/zgeoff-tools', '.editorconfig');
  const pulls = await ctx.readPullRequests();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(1);
  expect(editorconfig).toBe('root = true\n');

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore(sync): update the editorconfig',
      body:
        `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n` +
        '- `editorconfig`: The editor config',
      state: 'open',
      autoMerge: { method: 'squash', head },
    },
  ]);
});

test('it deletes a file that tools no longer syncs in a commit of its own', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const skill = { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' };

  const check = {
    source: 'sync/skills/demo/scripts/check.sh',
    target: '.claude/skills/demo/scripts/check.sh',
  };

  await ctx.writeSource(skill.source, '# Demo\n');
  await ctx.writeSource(check.source, 'echo check\n');
  await ctx.writeManifestCommit([{ name: 'skill-demo', files: [skill, check] }]);
  await ctx.writeManifestCommit([{ name: 'skill-demo', files: [skill] }]);
  await ctx.writeBranch('main', check.target, 'echo check\n');

  const exitCode = await ctx.runSync([
    { name: 'skill-demo', description: 'The demo skill', files: [skill] },
  ]);

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();
  const commit = await ctx.readToolsHead();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(files).toStrictEqual(['.claude/skills/demo/SKILL.md', 'README.md']);

  expect(subjects).toStrictEqual([
    'chore: sync skill-demo from zgeoff/tools',
    'chore: remove the files zgeoff/tools no longer syncs',
  ]);

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore(sync): update the demo skill and the retired files',
      body:
        `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n` +
        '- `skill-demo`: The demo skill\n' +
        '- `retired-files`: The copies of files zgeoff/tools no longer syncs: `.claude/skills/demo/scripts/check.sh`',
      state: 'open',
      autoMerge: { method: 'squash', head },
    },
  ]);
});

test('it keeps a file the repo owns outside the synced paths', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const skill = { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' };

  const check = {
    source: 'sync/skills/demo/scripts/check.sh',
    target: '.claude/skills/demo/scripts/check.sh',
  };

  await ctx.writeSource(skill.source, '# Demo\n');
  await ctx.writeSource(check.source, 'echo check\n');
  await ctx.writeManifestCommit([{ name: 'skill-demo', files: [skill, check] }]);
  await ctx.writeManifestCommit([{ name: 'skill-demo', files: [skill] }]);
  await ctx.writeBranch('main', 'scripts/check.sh', 'echo check\n');

  const exitCode = await ctx.runSync([
    { name: 'skill-demo', description: 'The demo skill', files: [skill] },
  ]);

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(files).toStrictEqual(['.claude/skills/demo/SKILL.md', 'README.md', 'scripts/check.sh']);
  expect(subjects).toStrictEqual(['chore: sync skill-demo from zgeoff/tools']);
});

test('it syncs from a tools ref that has no retired-file cleanup', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.removeSource('scripts/remove-retired-sync-files.sh');
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const exitCode = await ctx.runSync([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ]);

  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(subjects).toStrictEqual(['chore: sync editorconfig from zgeoff/tools']);
});

test('it removes a retired file when the run syncs no entry', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const agents = { source: 'agents/shared.md', target: 'agents/shared.md' };

  await ctx.writeSource(agents.source, '# Shared\n');
  await ctx.writeManifestCommit([{ name: 'agents', files: [agents] }]);
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('main', agents.target, '# Shared\n');

  const exitCode = await ctx.runSync([]);
  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(files).toStrictEqual(['README.md']);
  expect(subjects).toStrictEqual(['chore: remove the files zgeoff/tools no longer syncs']);
});

test('it keeps the retired files of an entry that fails', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const run = { source: 'sync/hooks/demo/run.ts', target: '.claude/hooks/demo/run.ts' };
  const helper = { source: 'sync/hooks/demo/helper.ts', target: '.claude/hooks/demo/helper.ts' };
  const editorconfig = { source: 'sync/editorconfig', target: '.editorconfig' };

  await ctx.writeSource(run.source, 'export {};\n');
  await ctx.writeSource(helper.source, 'export {};\n');
  await ctx.writeSource(editorconfig.source, 'root = true\n');
  await ctx.writeManifestCommit([{ name: 'hook-demo', files: [run, helper] }]);

  await ctx.writeManifestCommit([
    { name: 'hook-demo', files: [run] },
    { name: 'editorconfig', files: [editorconfig] },
  ]);

  await ctx.writeBranch('main', helper.target, 'export {};\n');

  const exitCode = await ctx.runSync([
    { name: 'hook-demo', description: 'The demo hook', files: [run], build: 'exit 3' },
    { name: 'editorconfig', description: 'The editor config', files: [editorconfig] },
  ]);

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(1);
  expect(files).toStrictEqual(['.claude/hooks/demo/helper.ts', '.editorconfig', 'README.md']);
  expect(subjects).toStrictEqual(['chore: sync editorconfig from zgeoff/tools']);
});

test('it pins each call of a shared workflow in a delivered caller to the commit it syncs from', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  await ctx.writeSource(
    'sync/workflow-callers/pr.yml',
    [
      'jobs:',
      '  pr:',
      '    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main',
      "  gate: { uses: 'zgeoff/tools/.github/workflows/paths-changed.yml@main' }",
      '',
    ].join('\n'),
  );

  const exitCode = await ctx.runSync([
    {
      name: 'workflow-pr',
      description: 'The PR workflow',
      files: [{ source: 'sync/workflow-callers/pr.yml', target: '.github/workflows/pr.yml' }],
    },
  ]);

  const workflow = await ctx.readBranch('repo-sync/zgeoff-tools', '.github/workflows/pr.yml');
  const commit = await ctx.readToolsHead();

  expect(exitCode).toBe(0);

  expect(workflow).toBe(
    [
      'jobs:',
      '  pr:',
      `    uses: zgeoff/tools/.github/workflows/bun-checks.yml@${commit} # main`,
      `  gate: { uses: 'zgeoff/tools/.github/workflows/paths-changed.yml@${commit}' }`,
      '',
    ].join('\n'),
  );
});

test('it overwrites a workflow of the repo that calls the same shared workflow', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  // An older commit of zgeoff/tools, so the run can order the pin against the one it syncs.
  const pinned = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/pr.yml',
    `name: Own PR checks\njobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@${pinned} # main\n`,
  );

  await ctx.writeSource(
    'sync/workflow-callers/pr.yml',
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main\n',
  );

  const exitCode = await ctx.runSync([
    {
      name: 'workflow-pr',
      description: 'The PR workflow',
      files: [{ source: 'sync/workflow-callers/pr.yml', target: '.github/workflows/pr.yml' }],
    },
  ]);

  const workflow = await ctx.readBranch('repo-sync/zgeoff-tools', '.github/workflows/pr.yml');
  const commit = await ctx.readToolsHead();

  expect(exitCode).toBe(0);

  expect(workflow).toBe(
    `jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@${commit} # main\n`,
  );
});

test("it pins the repo's own calls to zgeoff/tools in the sync pull request, which still merges on its own", async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  // An older commit of zgeoff/tools, so the run can order the pin against the one it syncs.
  const pinned = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${pinned} # main\n`,
  );

  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const exitCode = await ctx.runSync([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ]);

  const caller = await ctx.readBranch('repo-sync/zgeoff-tools', '.github/workflows/repo-sync.yml');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');
  const bodies = await ctx.readCommitBodies('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');
  const commit = await ctx.readToolsHead();

  expect(exitCode).toBe(0);

  expect(caller).toBe(
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${commit} # main\n`,
  );

  expect(subjects).toStrictEqual([
    'chore: sync editorconfig from zgeoff/tools',
    `chore: pin the zgeoff/tools workflows to ${commit.slice(0, 12)}`,
  ]);

  expect(commit).toMatch(/^[0-9a-f]{40}$/u);

  expect(bodies.at(-1)).toBe(
    `Each call to a zgeoff/tools workflow pins ${commit}, the commit this sync copies.`,
  );

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore(sync): update the editorconfig',
      body:
        `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n` +
        '- `editorconfig`: The editor config',
      state: 'open',
      autoMerge: { method: 'squash', head },
    },
  ]);
});

test('it leaves the pin alone and opens no pull request when every entry matches', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  // An older commit of zgeoff/tools, so the run can order the pin against the one it syncs.
  const pinned = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${pinned} # main\n`,
  );

  await ctx.writeSource('sync/readme.md', '# app\n');

  const exitCode = await ctx.runSync([
    {
      name: 'readme',
      description: 'The readme',
      files: [{ source: 'sync/readme.md', target: 'README.md' }],
    },
  ]);

  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main']);
  expect(pulls).toStrictEqual([]);
});

test('it moves the pins alone when every entry matches but a pinned reusable workflow changed', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  // An older commit of zgeoff/tools, so the run can order the pin against the one it syncs.
  const pinned = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${pinned} # main\n`,
  );

  await ctx.writeSource('sync/readme.md', '# app\n');
  await ctx.writeSource('.github/workflows/repo-sync.yml', 'on:\n  workflow_call:\njobs: {}\n');

  const exitCode = await ctx.runSync([
    {
      name: 'readme',
      description: 'The readme',
      files: [{ source: 'sync/readme.md', target: 'README.md' }],
    },
  ]);

  const caller = await ctx.readBranch('repo-sync/zgeoff-tools', '.github/workflows/repo-sync.yml');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');
  const commit = await ctx.readToolsHead();

  expect(exitCode).toBe(0);

  expect(caller).toBe(
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${commit} # main\n`,
  );

  expect(subjects).toStrictEqual([
    `chore: pin the zgeoff/tools workflows to ${commit.slice(0, 12)}`,
  ]);

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore(sync): update the zgeoff/tools pins',
      body:
        `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n` +
        '- `tools-pins`: The calls to zgeoff/tools workflows, whose pinned commit changed a workflow or a step script',
      state: 'open',
      autoMerge: { method: 'squash', head },
    },
  ]);
});

test('it leaves the open pull request alone when it already syncs a newer commit', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  // An older commit of zgeoff/tools, so the run can order the pin against the one it syncs.
  const pinned = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${pinned} # main\n`,
  );

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const older = await ctx.writeToolsCommit();

  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_style = space\n');
  await ctx.runSync([entry]);

  const newer = await ctx.readToolsHead();
  const headBefore = await ctx.readBranchHead('repo-sync/zgeoff-tools');
  const exitCode = await ctx.runSync([entry], { TOOLS_REF: older });
  const headAfter = await ctx.readBranchHead('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(headAfter).toBe(headBefore);

  expect(ctx.output).toContain(
    `Pull request #1 already pins ${newer}, which is newer than ${older}; nothing to do.\n`,
  );
});

test('it refuses a ref that is not a full commit ID and pushes nothing', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const exitCode = await ctx.runSync(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
    ],
    { TOOLS_REF: 'main' },
  );

  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(1);
  expect(branches).toStrictEqual(['main']);
  expect(pulls).toStrictEqual([]);
  expect(ctx.output).toStrictEqual(["::error::the tools ref 'main' is not a full commit ID\n"]);
});

test('it refuses a commit that is not on main of zgeoff/tools before any build and pushes nothing', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const marker = join(dirname(ctx.origin), 'build-ran');

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    build: `touch '${marker}'`,
  };

  const side = await ctx.writeSideCommit([entry]);
  const exitCode = await ctx.runSync([entry], { TOOLS_REF: side });
  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(1);
  expect(branches).toStrictEqual(['main']);
  expect(pulls).toStrictEqual([]);
  expect(existsSync(marker)).toBeFalse();
  expect(ctx.output).toStrictEqual([`::error::${side} is not a commit on main of zgeoff/tools\n`]);
});

test('it reports the path and cause of a copy that fails before it leaves the entry out', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('main', 'config', 'a file where the entry needs a folder\n');
  await ctx.writeSource('sync/editor.json', '{}\n');

  const exitCode = await ctx.runSync([
    {
      name: 'editor',
      description: 'The editor settings',
      files: [{ source: 'sync/editor.json', target: 'config/editor.json' }],
    },
  ]);

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    expect.stringMatching(/^::error::editor: EEXIST: .*config.*\n$/u),
    '::error::editor failed, so the sync leaves it out.\n',
    '',
    'No pull request published; the per-entry branches stay.\n',
    '::error::These entries failed and are not in the sync: editor\n',
  ]);
});

test('it leaves out a file excepted for the caller and drops the Markdown block that needs it', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  await ctx.writeSource(
    'sync/skills/demo/SKILL.md',
    [
      '# Demo',
      '',
      '<!-- repo-sync needs references/rust.md -->',
      'Read [the Rust notes](references/rust.md).',
      '<!-- repo-sync end -->',
      '',
      'Boil the kettle.',
      '',
    ].join('\n'),
  );

  await ctx.writeSource('sync/skills/demo/references/rust.md', '# Rust\n');

  const exitCode = await ctx.runSync([
    {
      name: 'skill-demo',
      description: 'The demo skill',
      files: [
        { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
        {
          source: 'sync/skills/demo/references/rust.md',
          target: '.claude/skills/demo/references/rust.md',
          except: ['Example/App'],
        },
      ],
    },
  ]);

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const skill = await ctx.readBranch('repo-sync/zgeoff-tools', '.claude/skills/demo/SKILL.md');

  expect(exitCode).toBe(0);
  expect(files).toStrictEqual(['.claude/skills/demo/SKILL.md', 'README.md']);
  expect(skill).toBe('# Demo\n\nBoil the kettle.\n');
});

test('it syncs the other files of an entry whose excepted workflow target is a folder in the caller', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('main', '.github/workflows/demo.yml/notes.txt', 'kept\n');
  await ctx.writeSource('sync/editorconfig', 'root = true\n');
  await ctx.writeSource('sync/workflow-callers/demo.yml', 'on: push\n');

  const exitCode = await ctx.runSync([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [
        { source: 'sync/editorconfig', target: '.editorconfig' },
        {
          source: 'sync/workflow-callers/demo.yml',
          target: '.github/workflows/demo.yml',
          except: ['example/app'],
        },
      ],
    },
  ]);

  const editorconfig = await ctx.readBranch('repo-sync/zgeoff-tools', '.editorconfig');

  const notes = await ctx.readBranch(
    'repo-sync/zgeoff-tools',
    '.github/workflows/demo.yml/notes.txt',
  );

  expect(exitCode).toBe(0);
  expect(editorconfig).toBe('root = true\n');
  expect(notes).toBe('kept\n');
  expect(ctx.output).not.toContain(expect.stringContaining('::error::'));
});

test("it refuses the commit with git's error when it cannot read the base from the remote", async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const exitCode = await ctx.runSync(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
    ],
    { GIT_ALLOW_PROTOCOL: 'https' },
  );

  const toolsHead = await ctx.readToolsHead();
  const branches = await ctx.readBranchNames();

  expect(exitCode).toBe(1);
  expect(branches).toStrictEqual(['main']);

  expect(ctx.output).toStrictEqual([
    `::error::Cannot read main from the remote, so the run cannot tell whether ${toolsHead} is older than its pin; the next run tries again: fatal: transport 'file' not allowed\n`,
  ]);
});

test('it turns auto-merge off before it pushes a later release to the sync branch', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const entries = [
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ];

  await ctx.runSync(entries);
  await ctx.writeSource('sync/editorconfig', 'root = false\n');

  // The remote refuses a push to the sync branch while its pull request has auto-merge on.
  const hook = join(ctx.origin, 'hooks', 'pre-receive');

  await writeFile(
    hook,
    [
      '#!/usr/bin/env bash',
      'while read -r _old _new ref; do',
      `  if [ "$ref" = refs/heads/repo-sync/zgeoff-tools ] && jq -e 'any(.[]; has("autoMerge"))' '${ctx.state}' > /dev/null; then`,
      "    echo 'auto-merge is on' >&2",
      '    exit 1',
      '  fi',
      'done',
      '',
    ].join('\n'),
  );

  await chmod(hook, 0o755);

  const exitCode = await ctx.runSync(entries);
  const pulls = await ctx.readPullRequests();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');
  const editorconfig = await ctx.readBranch('repo-sync/zgeoff-tools', '.editorconfig');

  expect(exitCode).toBe(0);
  expect(editorconfig).toBe('root = false\n');
  expect(pulls).toStrictEqual([expect.objectContaining({ autoMerge: { method: 'squash', head } })]);
});

test('it leaves auto-merge off when a build writes a file the manifest does not deliver', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const exitCode = await ctx.runSync([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      build: 'echo stray > notes.txt',
    },
  ]);

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(files).toStrictEqual(['.editorconfig', 'README.md', 'notes.txt']);
  expect(pulls).toStrictEqual([expect.not.objectContaining({ autoMerge: expect.anything() })]);

  expect(ctx.output).toContain(
    '::warning::Pull request #1 changes files the manifest does not deliver, so it waits for review: notes.txt\n',
  );
});

test('it turns auto-merge off when a later run carries a file the manifest does not deliver', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.runSync([entry]);
  await ctx.writeSource('sync/editorconfig', 'root = false\n');

  const exitCode = await ctx.runSync([{ ...entry, build: 'echo stray > notes.txt' }]);
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(pulls).toStrictEqual([expect.not.objectContaining({ autoMerge: expect.anything() })]);
});

test('it turns auto-merge on when a build changes package.json only by the scripts it declares', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit(
    'package.json',
    '{ "name": "app", "scripts": { "test": "bun test" } }\n',
  );

  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/check-demo.ts', 'export {};\n');

  const exitCode = await ctx.runSync([
    {
      name: 'check-demo',
      description: 'The demo check',
      files: [{ source: 'sync/check-demo.ts', target: 'scripts/check-demo.ts' }],
      build:
        'jq \'.scripts["check:demo"] = "bun scripts/check-demo.ts"\' package.json > package.json.tmp && mv package.json.tmp package.json',
      scripts: { 'check:demo': 'bun scripts/check-demo.ts' },
    },
  ]);

  const pulls = await ctx.readPullRequests();
  const head = await ctx.readBranchHead('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(0);
  expect(pulls).toStrictEqual([expect.objectContaining({ autoMerge: { method: 'squash', head } })]);
});

test('it warns and passes when the repo refuses auto-merge', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const exitCode = await ctx.runSync(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
    ],
    { STUB_GH_AUTO_MERGE_REFUSAL: 'GraphQL: Auto merge is not allowed for this repository' },
  );

  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(pulls).toStrictEqual([expect.not.objectContaining({ autoMerge: expect.anything() })]);

  expect(ctx.output).toContain(
    '::warning::Auto-merge of pull request #1 did not turn on, so it waits for review: GraphQL: Auto merge is not allowed for this repository\n',
  );
});

test('it leaves auto-merge off when the open pull request merges into another branch than the run synced from', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const entries = [
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ];

  await ctx.runSync(entries);
  await ctx.writeSource('sync/editorconfig', 'root = false\n');
  await ctx.writeBranch('feature', 'README.md', '# app on a feature branch\n');

  const exitCode = await ctx.runSync(entries, { BASE: 'feature' });
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(pulls).toStrictEqual([expect.not.objectContaining({ autoMerge: expect.anything() })]);

  expect(ctx.output).toContain(
    '::warning::Pull request #1 merges into main, not feature, which the run synced from, so it waits for review.\n',
  );
});

test('it leaves the repo alone when its own pin is newer than the commit it was sent', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const older = await ctx.writeToolsCommit();

  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_style = space\n');

  const newer = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${newer} # main\n`,
  );

  const exitCode = await ctx.runSync([entry], { TOOLS_REF: older });
  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main']);
  expect(pulls).toStrictEqual([]);

  expect(ctx.output).toContain(
    `main already pins ${newer}, which is newer than ${older}; nothing to do.\n`,
  );
});

test('it fetches a newer pin that the tools checkout lacks before it compares the commits', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const older = await ctx.writeToolsCommit();

  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_style = space\n');

  const newer = await ctx.writeToolsCommit();

  await ctx.writeRemoteOnlyCommit(newer, older);

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${newer} # main\n`,
  );

  const exitCode = await ctx.runSync([entry], { TOOLS_REF: older });
  const branches = await ctx.readBranchNames();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main']);

  expect(ctx.output).toContain(
    `main already pins ${newer}, which is newer than ${older}; nothing to do.\n`,
  );
});

test('it reads the pin of the base as the remote holds it when a newer pin merges after the checkout', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const older = await ctx.writeToolsCommit();

  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_style = space\n');

  const newer = await ctx.writeToolsCommit();

  const exitCode = await ctx.runSync([entry], { TOOLS_REF: older }, async () => {
    await ctx.writeBranch(
      'main',
      '.github/workflows/repo-sync.yml',
      `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${newer} # main\n`,
    );
  });

  const branches = await ctx.readBranchNames();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main']);

  expect(ctx.output).toContain(
    `main already pins ${newer}, which is newer than ${older}; nothing to do.\n`,
  );
});

test('it opens no pull request when a delivered workflow differs from its source only by the pin', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  // An older commit of zgeoff/tools, so the run can order the pin against the one it syncs.
  const pinned = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync-guard.yml',
    `jobs:\n  guard:\n    uses: zgeoff/tools/.github/workflows/repo-sync-guard.yml@${pinned} # main\n`,
  );

  await ctx.writeSource(
    'sync/workflow-callers/repo-sync-guard.yml',
    'jobs:\n  guard:\n    uses: zgeoff/tools/.github/workflows/repo-sync-guard.yml@main\n',
  );

  const exitCode = await ctx.runSync([
    {
      name: 'workflow-repo-sync-guard',
      description: 'The repo-sync guard',
      files: [
        {
          source: 'sync/workflow-callers/repo-sync-guard.yml',
          target: '.github/workflows/repo-sync-guard.yml',
        },
      ],
    },
  ]);

  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main']);
  expect(pulls).toStrictEqual([]);
});

test('it leaves the repo alone when any workflow on main pins a newer commit than the one it was sent', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const first = await ctx.writeToolsCommit();

  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_size = 2\n');

  const delayed = await ctx.writeToolsCommit();

  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_size = 4\n');

  const newest = await ctx.writeToolsCommit();

  await ctx.writeBranch(
    'main',
    '.github/workflows/a-checks.yml',
    `jobs:\n  checks:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@${first} # main\n`,
  );

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    `jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@${newest} # main\n`,
  );

  const exitCode = await ctx.runSync([entry], { TOOLS_REF: delayed });
  const branches = await ctx.readBranchNames();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main']);

  expect(ctx.output).toContain(
    `main already pins ${newest}, which is newer than ${delayed}; nothing to do.\n`,
  );
});

test('it stops and pushes nothing when main pins a commit that zgeoff/tools does not have', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  await ctx.writeBranch(
    'main',
    '.github/workflows/repo-sync.yml',
    'jobs:\n  sync:\n    uses: zgeoff/tools/.github/workflows/repo-sync.yml@0123456789abcdef0123456789abcdef01234567 # main\n',
  );

  const exitCode = await ctx.runSync([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
  ]);

  const toolsHead = await ctx.readToolsHead();
  const branches = await ctx.readBranchNames();

  expect(exitCode).toBe(1);
  expect(branches).toStrictEqual(['main']);

  expect(ctx.output).toStrictEqual([
    `::error::Cannot tell whether ${toolsHead} is older than the pin 0123456789abcdef0123456789abcdef01234567 on main, so the run stops; the next run tries again: fatal: Not a valid commit name 0123456789abcdef0123456789abcdef01234567\n`,
  ]);
});

test('it stops and pushes nothing when it cannot read the branch of the open pull request', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const entry = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
  };

  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  const older = await ctx.writeToolsCommit();

  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_style = space\n');
  await ctx.runSync([entry]);

  // The pull request stays open while its branch cannot be fetched, as in a transient failure.
  await $`git -C ${ctx.origin} branch -D repo-sync/zgeoff-tools`.quiet();

  const exitCode = await ctx.runSync([entry], { TOOLS_REF: older });
  const branches = await ctx.readBranchNames();

  expect(exitCode).toBe(1);
  expect(branches).toStrictEqual(['main']);

  expect(ctx.output.at(-1)).toStartWith(
    `::error::Cannot read repo-sync/zgeoff-tools from the remote, so the run cannot tell whether ${older} is older than its pin; the next run tries again: fatal: couldn't find remote ref repo-sync/zgeoff-tools`,
  );
});
