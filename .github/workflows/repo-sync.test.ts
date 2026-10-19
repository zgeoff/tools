import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { createStubGh } from './create-stub-gh.ts';
import { runWorkflowSteps } from './run-workflow-steps.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'repo-sync-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'repo-sync.yml');
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
  await createStubGh(bin, state);
  await mkdir(join(tools, 'scripts'), { recursive: true });

  for (const script of ['select-sync-files.sh', 'remove-excluded-blocks.sh']) {
    await cp(join(root, 'scripts', script), join(tools, 'scripts', script));
  }

  await $`git init -q --bare -b main ${origin}`.env(env);
  await $`git clone -q ${origin} ${seed}`.env(env).quiet();

  await writeFile(join(seed, 'README.md'), '# app\n');

  await $`git -C ${seed} add -A && git -C ${seed} commit -q -m init && git -C ${seed} push -q origin HEAD:main`
    .env(env)
    .quiet();

  const runSync = async (entries: unknown[], toolsRef: string) => {
    const caller = await mkdtemp(join(directory, 'caller-'));

    await $`git clone -q ${origin} ${caller}`.env(env).quiet();

    await cp(tools, join(caller, '.repo-sync'), { recursive: true });

    return runWorkflowSteps(
      workflow,
      'sync',
      [
        "Commit each entry's files",
        'Push the sync branch',
        'Open or update the pull request',
        'Delete the per-entry sync branches',
        'Fail on the entries left out',
      ],
      {
        cwd: caller,
        env: { ...env, PATH: `${bin}:${process.env['PATH']}` },
        expressions: {
          'needs.prepare.outputs.entries': JSON.stringify(entries),
          'inputs.tools-ref': toolsRef,
          'job.workflow_ref': 'zgeoff/tools/.github/workflows/repo-sync.yml@refs/tags/sync-v1',
          'github.repository': 'example/app',
          'github.ref_name': 'main',
          'steps.app-token.outputs.token': 'token',
        },
        outputPath: `${caller}.output`,
      },
    );
  };

  const runPrepare = async (manifest: unknown[], include: string) => {
    const checkout = await mkdtemp(join(directory, 'prepare-'));

    await mkdir(join(checkout, 'sync'));
    await writeFile(join(checkout, 'sync', 'manifest.json'), JSON.stringify(manifest));

    await runWorkflowSteps(workflow, 'prepare', ['Drop the skipped and the unrequested entries'], {
      cwd: checkout,
      env,
      expressions: { 'inputs.skip': '', 'inputs.include': include },
      outputPath: `${checkout}.output`,
    });

    const output = await readFile(`${checkout}.output`, 'utf8');

    return output;
  };

  const writeSource = async (path: string, content: string) => {
    await mkdir(dirname(join(tools, path)), { recursive: true });
    await writeFile(join(tools, path), content);
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

  const writeBranch = async (branch: string, path: string, content: string) => {
    await $`git -C ${seed} checkout -q -B ${branch} origin/main`.env(env).quiet();

    await mkdir(dirname(join(seed, path)), { recursive: true });
    await writeFile(join(seed, path), content);

    await $`git -C ${seed} add -A && git -C ${seed} commit -q -m ${branch} && git -C ${seed} push -q -f origin ${`${branch}:${branch}`}`
      .env(env)
      .quiet();
  };

  return {
    runPrepare,
    runSync,
    writeSource,
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

test.each([
  ['true when a selected entry', 'workflow-demo', 'true'],
  ['false when only a filtered-out entry', '', 'false'],
])('it outputs workflows %s targets a workflow', async (_label, include, expected) => {
  const ctx = await setupTest();

  const output = await ctx.runPrepare(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
      {
        name: 'workflow-demo',
        description: 'The demo workflow',
        optIn: true,
        files: [{ source: 'sync/workflow-demo.yml', target: '.github/workflows/demo.yml' }],
      },
    ],
    include,
  );

  expect(output).toEndWith(`\nworkflows=${expected}\n`);
});

test('it asks for workflows write on the token only when the prepare output is true', async () => {
  const workflow = await readFile(join(import.meta.dir, 'repo-sync.yml'), 'utf8');

  expect(workflow).toInclude(
    `permission-workflows: \${{ needs.prepare.outputs.workflows == 'true' && 'write' || '' }}`,
  );
});

test('it leaves out every file of an entry whose workflow conflicts, syncs the others, and fails the run', async () => {
  const ctx = await setupTest();

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
