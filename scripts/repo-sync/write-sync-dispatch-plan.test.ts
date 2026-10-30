import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { buildCommandStub } from '../../test-utils/build-command-stub.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeSyncDispatchPlan } from './write-sync-dispatch-plan.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-sync-dispatch-plan-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const origin = join(directory, 'origin.git');
  const tools = join(directory, 'tools');
  const checkout = join(directory, 'checkout');
  const outputPath = join(directory, 'output');

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  await writeFile(outputPath, '');

  await $`git init -q --bare -b main ${origin}`.env(env);
  await $`git clone -q ${origin} ${tools}`.env(env).quiet();

  // The job's checkout is cloned before any commit lands, so a commit reaches it only by a fetch.
  await $`git clone -q ${origin} ${checkout}`.env(env).quiet();

  const output: string[] = [];

  const writeToolsCommit = async (files: Readonly<Record<string, string>>) => {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(tools, path)), { recursive: true });
      await writeFile(join(tools, path), content);
    }

    await $`git -C ${tools} add -A && git -C ${tools} commit -q --allow-empty -m change && git -C ${tools} push -q origin HEAD:main`
      .env(env)
      .quiet();

    const head = await $`git -C ${tools} rev-parse HEAD`.text();

    return head.trim();
  };

  // git runs for real in the job's checkout, and each test answers the query for green runs.
  const commands = buildCommandStub({ program: 'git', runCommand });

  const answerGreenCommits = (greenCommits: readonly string[]) => {
    commands.answer(
      [
        'gh',
        'api',
        '-X',
        'GET',
        'repos/example/tools/actions/workflows/main.yml/runs',
        '-f',
        'branch=main',
        '-f',
        'event=push',
        '-f',
        'status=success',
        '-f',
        'per_page=50',
        '--jq',
        '.workflow_runs[].head_sha',
      ],
      { exitCode: 0, stdout: greenCommits.map((commit) => `${commit}\n`).join(''), stderr: '' },
    );
  };

  const plan = (event: string, runCommit: string) =>
    writeSyncDispatchPlan({
      cwd: checkout,
      env,
      event,
      runCommit,
      repo: 'example/tools',
      outputPath,
      fileSystem: nodeFileSystem,
      runCommand: commands.runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const readOutputs = () => readFile(outputPath, 'utf8');

  return { output, writeToolsCommit, answerGreenCommits, plan, readOutputs };
}

test('it sends the run commit when a synced source changed since the last green commit', async () => {
  const ctx = await setupTest();

  const previous = await ctx.writeToolsCommit({
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
    'sync/skills/demo/SKILL.md': '# Demo\n',
  });

  const commit = await ctx.writeToolsCommit({ 'sync/skills/demo/SKILL.md': '# Demo, changed\n' });

  ctx.answerGreenCommits([commit, previous]);

  const exitCode = await ctx.plan('workflow_run', commit);
  const outputs = await ctx.readOutputs();

  expect(exitCode).toBe(0);
  expect(outputs).toBe(`send=true\ncommit=${commit}\n`);
});

test('it sends nothing when only files outside the manifest changed', async () => {
  const ctx = await setupTest();

  const previous = await ctx.writeToolsCommit({
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
    'sync/skills/demo/SKILL.md': '# Demo\n',
  });

  const commit = await ctx.writeToolsCommit({ 'packages/std/README.md': '# std\n' });

  ctx.answerGreenCommits([commit, previous]);

  const exitCode = await ctx.plan('workflow_run', commit);
  const outputs = await ctx.readOutputs();

  expect(exitCode).toBe(0);
  expect(outputs).toBe(`send=false\ncommit=${commit}\n`);

  expect(ctx.output).toStrictEqual([
    `No synced source changed up to ${commit}; nothing to dispatch.\n`,
  ]);
});

test('it sends when a commit drops an entry, so the repos remove the retired copies', async () => {
  const ctx = await setupTest();

  const previous = await ctx.writeToolsCommit({
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
    'sync/skills/demo/SKILL.md': '# Demo\n',
  });

  const commit = await ctx.writeToolsCommit({ 'sync/manifest.json': '[]' });

  ctx.answerGreenCommits([commit, previous]);

  await ctx.plan('workflow_run', commit);

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe(`send=true\ncommit=${commit}\n`);
});

test('it sends the newest green commit for a dispatch from another repo', async () => {
  const ctx = await setupTest();

  const commit = await ctx.writeToolsCommit({
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  });

  ctx.answerGreenCommits([commit]);

  await ctx.plan('repository_dispatch', '');

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe(`send=true\ncommit=${commit}\n`);
});

test('it sends the newest green commit from the run of an older one that changed a synced source', async () => {
  const ctx = await setupTest();

  const first = await ctx.writeToolsCommit({
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
    'sync/skills/demo/SKILL.md': '# Demo\n',
  });

  const synced = await ctx.writeToolsCommit({ 'sync/skills/demo/SKILL.md': '# Demo, changed\n' });
  const unrelated = await ctx.writeToolsCommit({ 'packages/std/README.md': '# std\n' });

  ctx.answerGreenCommits([unrelated, synced, first]);

  await ctx.plan('workflow_run', synced);

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe(`send=true\ncommit=${unrelated}\n`);
});
