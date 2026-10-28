import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { createStubPullRequestGH } from '../../test-utils/create-stub-pull-request-gh.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
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
  const runSync = async (entries: unknown[], toolsRef: string, workflows = 'false') => {
    const caller = await mkdtemp(join(directory, 'caller-'));

    await $`git clone -q ${origin} ${caller}`.env(env).quiet();

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
        WORKFLOW_REF: 'zgeoff/tools/.github/workflows/repo-sync.yml@refs/tags/sync-v1',
        REPO: 'example/app',
        SKIP: '',
        WORKFLOWS: workflows,
        BASE: 'main',
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

  const readBranchNames = async () => {
    const refs =
      await $`git -C ${origin} for-each-ref ${'--format=%(refname:short)'} refs/heads`.text();

    return refs.split('\n').filter((name) => name !== '');
  };

  const readCommitSubjects = async (branch: string) => {
    const log = await $`git -C ${origin} log --reverse --format=%s main..${branch}`.text();

    return log.split('\n').filter((subject) => subject !== '');
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
    output,
    runSync,
    writeMainCommit,
    writeSource,
    writeManifestCommit,
    removeSource,
    readBranch,
    readBranchFiles,
    readBranchNames,
    readCommitSubjects,
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

  const exitCode = await ctx.runSync(
    [
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
    ],
    'sync-v7',
  );

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
      title: 'chore: sync zgeoff/tools sync-v7',
      body:
        'Copied from zgeoff/tools at sync-v7 by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry:\n\n' +
        '- `editorconfig`: The editor config\n' +
        '- `skill-demo`: The demo skill',
      state: 'open',
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
  await ctx.runSync(entries, 'sync-v7');
  await ctx.writeSource('sync/editorconfig', 'root = true\n\n[*]\nindent_style = space\n');

  const exitCode = await ctx.runSync(entries, 'sync-v8');
  const branches = await ctx.readBranchNames();
  const editorconfig = await ctx.readBranch('repo-sync/zgeoff-tools', '.editorconfig');
  const socket = await ctx.readBranch('repo-sync/zgeoff-tools', 'socket.yml');
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main', 'repo-sync/zgeoff-tools']);
  expect(editorconfig).toBe('root = true\n\n[*]\nindent_style = space\n');
  expect(socket).toBe('version: 2\n');

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore: sync zgeoff/tools sync-v8',
      body:
        'Copied from zgeoff/tools at sync-v8 by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry:\n\n' +
        '- `editorconfig`: The editor config\n' +
        '- `socket`: The Socket config',
      state: 'open',
    },
  ]);
});

test('it deletes the sync/<name> branch of each entry it syncs', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('sync/editorconfig', '.editorconfig', 'root = false\n');
  await ctx.writeSource('sync/editorconfig', 'root = true\n');

  await ctx.runSync(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
    ],
    'sync-v7',
  );

  const branches = await ctx.readBranchNames();

  expect(branches).toStrictEqual(['main', 'repo-sync/zgeoff-tools']);
});

test('it deletes the sync branch and opens no pull request when every entry matches', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('repo-sync/zgeoff-tools', '.editorconfig', 'root = false\n');
  await ctx.writeSource('sync/readme.md', '# app\n');

  const exitCode = await ctx.runSync(
    [
      {
        name: 'readme',
        description: 'The readme',
        files: [{ source: 'sync/readme.md', target: 'README.md' }],
      },
    ],
    'sync-v7',
  );

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

  const exitCode = await ctx.runSync(
    [
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
    ],
    'sync-v7',
  );

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(1);
  expect(files).toStrictEqual(['.editorconfig', 'README.md']);
  expect(subjects).toStrictEqual(['chore: sync editorconfig from zgeoff/tools']);

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore: sync zgeoff/tools sync-v7',
      body:
        'Copied from zgeoff/tools at sync-v7 by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry:\n\n' +
        '- `editorconfig`: The editor config',
      state: 'open',
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

  await ctx.runSync(
    [
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
    ],
    'sync-v7',
  );

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

  const exitCode = await ctx.runSync(
    [
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
    ],
    'sync-v7',
  );

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

  const exitCode = await ctx.runSync(
    [
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
    ],
    'sync-v7',
  );

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
  await ctx.runSync([entry], 'sync-v7');
  await ctx.writeSource('sync/editorconfig', 'root = false\n');

  const exitCode = await ctx.runSync([{ ...entry, build: 'exit 3' }], 'sync-v8');
  const editorconfig = await ctx.readBranch('repo-sync/zgeoff-tools', '.editorconfig');
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(1);
  expect(editorconfig).toBe('root = true\n');

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore: sync zgeoff/tools sync-v7',
      body:
        'Copied from zgeoff/tools at sync-v7 by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry:\n\n' +
        '- `editorconfig`: The editor config',
      state: 'open',
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

  const exitCode = await ctx.runSync(
    [{ name: 'skill-demo', description: 'The demo skill', files: [skill] }],
    'sync-v7',
  );

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();

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
      title: 'chore: sync zgeoff/tools sync-v7',
      body:
        'Copied from zgeoff/tools at sync-v7 by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry:\n\n' +
        '- `skill-demo`: The demo skill\n' +
        '- `retired-files`: The copies of files zgeoff/tools no longer syncs: `.claude/skills/demo/scripts/check.sh`',
      state: 'open',
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

  const exitCode = await ctx.runSync(
    [{ name: 'skill-demo', description: 'The demo skill', files: [skill] }],
    'sync-v7',
  );

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

  const exitCode = await ctx.runSync(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
    ],
    'sync-v15',
  );

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

  const exitCode = await ctx.runSync([], 'sync-v7');
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

  const exitCode = await ctx.runSync(
    [
      { name: 'hook-demo', description: 'The demo hook', files: [run], build: 'exit 3' },
      { name: 'editorconfig', description: 'The editor config', files: [editorconfig] },
    ],
    'sync-v7',
  );

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const subjects = await ctx.readCommitSubjects('repo-sync/zgeoff-tools');

  expect(exitCode).toBe(1);
  expect(files).toStrictEqual(['.claude/hooks/demo/helper.ts', '.editorconfig', 'README.md']);
  expect(subjects).toStrictEqual(['chore: sync editorconfig from zgeoff/tools']);
});

test('it keeps a retired workflow and removes the rest when the token lacks workflows write', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  const workflow = {
    source: 'sync/workflow-callers/lint.yml',
    target: '.github/workflows/lint.yml',
  };

  const script = { source: 'sync/scripts/lint.sh', target: 'scripts/lint.sh' };
  const editorconfig = { source: 'sync/editorconfig', target: '.editorconfig' };

  await ctx.writeSource(workflow.source, 'jobs: {}\n');
  await ctx.writeSource(script.source, 'echo lint\n');
  await ctx.writeSource(editorconfig.source, 'root = true\n');
  await ctx.writeManifestCommit([{ name: 'lint', files: [workflow, script] }]);
  await ctx.writeManifestCommit([{ name: 'editorconfig', files: [editorconfig] }]);
  await ctx.writeBranch('main', workflow.target, 'jobs: {}\n');
  await ctx.writeBranch('main', script.target, 'echo lint\n');

  const exitCode = await ctx.runSync(
    [{ name: 'editorconfig', description: 'The editor config', files: [editorconfig] }],
    'sync-v7',
    'false',
  );

  const files = await ctx.readBranchFiles('repo-sync/zgeoff-tools');
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(0);
  expect(files).toStrictEqual(['.editorconfig', '.github/workflows/lint.yml', 'README.md']);

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'repo-sync/zgeoff-tools',
      title: 'chore: sync zgeoff/tools sync-v7',
      body:
        'Copied from zgeoff/tools at sync-v7 by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry:\n\n' +
        '- `editorconfig`: The editor config\n' +
        '- `retired-files`: The copies of files zgeoff/tools no longer syncs: `scripts/lint.sh`',
      state: 'open',
    },
  ]);
});

test('it pins each call of a shared workflow at main to the ref of the workflow it runs', async () => {
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
      '  other:',
      '    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main-next',
      '',
    ].join('\n'),
  );

  const exitCode = await ctx.runSync(
    [
      {
        name: 'workflow-pr',
        description: 'The PR workflow',
        files: [{ source: 'sync/workflow-callers/pr.yml', target: '.github/workflows/pr.yml' }],
      },
    ],
    '',
    'true',
  );

  const workflow = await ctx.readBranch('repo-sync/zgeoff-tools', '.github/workflows/pr.yml');

  expect(exitCode).toBe(0);

  expect(workflow).toBe(
    [
      'jobs:',
      '  pr:',
      '    uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v1',
      "  gate: { uses: 'zgeoff/tools/.github/workflows/paths-changed.yml@sync-v1' }",
      '  other:',
      '    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main-next',
      '',
    ].join('\n'),
  );
});

test('it overwrites a workflow of the repo that calls the same shared workflow', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);

  await ctx.writeBranch(
    'main',
    '.github/workflows/pr.yml',
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v0\n',
  );

  await ctx.writeSource(
    'sync/workflow-callers/pr.yml',
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main\n',
  );

  const exitCode = await ctx.runSync(
    [
      {
        name: 'workflow-pr',
        description: 'The PR workflow',
        files: [{ source: 'sync/workflow-callers/pr.yml', target: '.github/workflows/pr.yml' }],
      },
    ],
    'sync-v7',
    'true',
  );

  const workflow = await ctx.readBranch('repo-sync/zgeoff-tools', '.github/workflows/pr.yml');

  expect(exitCode).toBe(0);

  expect(workflow).toBe(
    'jobs:\n  pr:\n    uses: zgeoff/tools/.github/workflows/bun-checks.yml@sync-v7\n',
  );
});

test('it refuses a ref it cannot pin a workflow to and pushes nothing', async () => {
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
    'sync v7',
  );

  const branches = await ctx.readBranchNames();
  const pulls = await ctx.readPullRequests();

  expect(exitCode).toBe(1);
  expect(branches).toStrictEqual(['main']);
  expect(pulls).toStrictEqual([]);
});

test('it reports the path and cause of a copy that fails before it leaves the entry out', async () => {
  const ctx = await setupTest();

  await ctx.writeMainCommit('README.md', '# app\n');
  await ctx.writeManifestCommit([]);
  await ctx.writeBranch('main', 'config', 'a file where the entry needs a folder\n');
  await ctx.writeSource('sync/editor.json', '{}\n');

  const exitCode = await ctx.runSync(
    [
      {
        name: 'editor',
        description: 'The editor settings',
        files: [{ source: 'sync/editor.json', target: 'config/editor.json' }],
      },
    ],
    'sync-v7',
  );

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    expect.stringMatching(/^::error::editor: EEXIST: .*config.*\n$/u),
    '::error::editor failed, so the sync leaves it out.\n',
    '',
    'No pull request published; the per-entry branches stay.\n',
    '::error::These entries failed and are not in the sync: editor\n',
  ]);
});
