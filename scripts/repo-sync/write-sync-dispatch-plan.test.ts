import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { CommandOptions, CommandResult } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeSyncDispatchPlan } from './write-sync-dispatch-plan.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-sync-dispatch-plan-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const tools = join(directory, 'tools');
  const outputPath = join(directory, 'output');

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  await mkdir(tools);
  await writeFile(outputPath, '');

  await $`git -C ${tools} init -q`.env(env);

  const output: string[] = [];

  const writeToolsCommit = async (files: Readonly<Record<string, string>>) => {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(tools, path)), { recursive: true });
      await writeFile(join(tools, path), content);
    }

    await $`git -C ${tools} add -A && git -C ${tools} commit -q --allow-empty -m change`
      .env(env)
      .quiet();

    const head = await $`git -C ${tools} rev-parse HEAD`.text();

    return head.trim();
  };

  // gh answers with the green commits; git runs for real in the tools checkout.
  const plan = (event: string, runCommit: string, greenCommits: readonly string[]) =>
    writeSyncDispatchPlan({
      cwd: tools,
      env,
      event,
      runCommit,
      repo: 'example/tools',
      outputPath,
      fileSystem: nodeFileSystem,
      runCommand: (argv: readonly string[], options: Readonly<CommandOptions>) => {
        if (argv[0] === 'gh') {
          const result: CommandResult = {
            exitCode: 0,
            stdout: greenCommits.map((commit) => `${commit}\n`).join(''),
            stderr: '',
          };

          return Promise.resolve(result);
        }

        return runCommand(argv, options);
      },
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const readOutputs = () => readFile(outputPath, 'utf8');

  return { output, writeToolsCommit, plan, readOutputs };
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
  const exitCode = await ctx.plan('workflow_run', commit, [commit, previous]);
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
  const exitCode = await ctx.plan('workflow_run', commit, [commit, previous]);
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

  await ctx.plan('workflow_run', commit, [commit, previous]);

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

  await ctx.plan('repository_dispatch', '', [commit]);

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe(`send=true\ncommit=${commit}\n`);
});

test('it sends nothing for a run whose commit a newer green commit replaces', async () => {
  const ctx = await setupTest();

  const older = await ctx.writeToolsCommit({
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  });

  const newer = await ctx.writeToolsCommit({ 'sync/manifest.json': '[]' });

  await ctx.plan('workflow_run', older, [newer, older]);

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe('send=false\ncommit=\n');
});
