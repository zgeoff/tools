import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The delivered entry point resolves @zgeoff/skill-gate from this repo's workspace, as a repo's
// copy resolves it from its own node_modules.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'skill-gate-entry-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const hookPath = fileURLToPath(new URL('skill-gate.ts', import.meta.url));

  return { dir, hookPath };
}

test('it denies a gated edit through the delivered entry point', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  await writeFile(join(ctx.dir, 'transcript.jsonl'), '');

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'guide.md') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.dir, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});
