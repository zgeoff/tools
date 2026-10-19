import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The delivered entry point resolves @zgeoff/skill-gate from this repo's workspace, as a repo's
// copy resolves it from its own node_modules.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-entry-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const hookPath = fileURLToPath(new URL('skill-gate.ts', import.meta.url));

  return { directory, hookPath };
}

test('it denies a gated edit through the delivered entry point', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  await writeFile(join(ctx.directory, 'transcript.jsonl'), '');

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'guide.md') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.directory, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it exits 1 with no gate output when the repo lacks @zgeoff/skill-gate', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'guide.md') },
    }),
  });

  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain("Cannot find module '@zgeoff/skill-gate'");
});
