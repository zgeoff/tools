import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

// The package packed and installed from its tarball into a fresh project, with the entry point a
// repo carries at .claude/hooks/skill-gate/skill-gate.ts. The pack writes under the test's own
// folder, so overlapping runs cannot race.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'skill-gate-package-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // The real HOME keeps bun install on the shared cache.
  const env = { PATH: process.env['PATH'], HOME: process.env['HOME'] };
  const packed = join(dir, 'packed');
  const project = join(dir, 'project');

  await Promise.all([
    mkdir(packed),
    mkdir(join(project, '.claude/hooks/skill-gate'), { recursive: true }),
  ]);

  // The runtime loads the shipped source, so the pack needs no build.
  await $`bun pm pack --ignore-scripts --destination ${packed}`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  const [tarball, ...extra] = await readdir(packed);

  invariant(tarball !== undefined && extra.length === 0, 'bun pm pack must write one tarball');

  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'project',
      private: true,
      devDependencies: { '@zgeoff/skill-gate': `file:${join(packed, tarball)}` },
    }),
  );

  await writeFile(
    join(project, '.claude/hooks/skill-gate/skill-gate.ts'),
    "import { runSkillGate } from '@zgeoff/skill-gate';\n\nawait runSkillGate();\n",
  );

  await $`bun install`.cwd(project).env(env).quiet();

  return { project, env, hookPath: join(project, '.claude/hooks/skill-gate/skill-gate.ts') };
}

test('it denies a gated edit through the entry point when the session has not loaded the skill', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.project, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  await writeFile(join(ctx.project, 'transcript.jsonl'), '');

  const payload = JSON.stringify({
    cwd: ctx.project,
    transcript_path: join(ctx.project, 'transcript.jsonl'),
    tool_input: { file_path: join(ctx.project, 'guide.md') },
  });

  const result = await $`bun ${ctx.hookPath} < ${new Response(payload)}`
    .cwd(ctx.project)
    .env({ ...ctx.env, CLAUDE_PROJECT_DIR: ctx.project })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(result.json()).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it allows an ungated edit through the entry point with no output', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.project, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  await writeFile(join(ctx.project, 'transcript.jsonl'), '');

  const payload = JSON.stringify({
    cwd: ctx.project,
    transcript_path: join(ctx.project, 'transcript.jsonl'),
    tool_input: { file_path: join(ctx.project, 'src/main.ts') },
  });

  const result = await $`bun ${ctx.hookPath} < ${new Response(payload)}`
    .cwd(ctx.project)
    .env({ ...ctx.env, CLAUDE_PROJECT_DIR: ctx.project })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});
