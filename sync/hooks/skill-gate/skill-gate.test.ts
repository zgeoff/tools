import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'skill-gate-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const hookPath = fileURLToPath(new URL('skill-gate.ts', import.meta.url));

  return { dir, hookPath };
}

test('it denies a test file edit until the session loads both testing skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, '.claude/skills/project-testing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');
  await writeFile(join(ctx.dir, '.claude/skills/project-testing/SKILL.md'), '# Project testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcript.jsonl'),
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"testing"}}]}}\n',
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`project-testing\` skill with the Skill tool before editing ${join(ctx.dir, 'src/a.test.ts')}, then retry the edit. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it allows a test file edit once the session loads both testing skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, '.claude/skills/project-testing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');
  await writeFile(join(ctx.dir, '.claude/skills/project-testing/SKILL.md'), '# Project testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"project-testing"}}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it stays silent in a repo without a rules file', async () => {
  const ctx = await setupTest();

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it warns and allows the edit when a rule names a skill the repo does not have', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'), { recursive: true });

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'README.md') },
    }),
  });

  const warning =
    'skill-gate: the rule "**/*.md" in .claude/skill-gate.json names the skill "docs-writing", but .claude/skills/docs-writing/SKILL.md does not exist. Fix the rule or add the skill; until then the gate skips that skill.';

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    systemMessage: warning,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warning },
  });
});

test('it warns and allows the edit when the rules file is not JSON', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skill-gate.json'), '{ "gates": [');

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'src/a.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(result.stdout).toStartWith(
    '{"systemMessage":"skill-gate: .claude/skill-gate.json is not valid JSON: ',
  );

  expect(result.stdout).toInclude(
    '"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"skill-gate: .claude/skill-gate.json is not valid JSON: ',
  );
});

test('it allows a file outside the project', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'project/.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.dir, 'project/.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, 'project/.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: join(ctx.dir, 'project') },
    input: JSON.stringify({
      cwd: join(ctx.dir, 'project'),
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'scratch/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it reads the project root from the payload cwd when CLAUDE_PROJECT_DIR is unset', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, 'a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.dir, 'a.test.ts')}, then retry the edit. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it stays silent on a payload without a file path', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'), { recursive: true });

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({ cwd: ctx.dir, tool_input: { command: 'ls' } }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});
