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
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
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

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`project-testing\` skill with the Skill tool before editing ${join(ctx.dir, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
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
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"project-testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: project-testing"}]}}',
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

test('it allows a subagent edit once the subagent loads both testing skills', async () => {
  const ctx = await setupTest();

  await Promise.all([
    mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true }),
    mkdir(join(ctx.dir, '.claude/skills/project-testing'), { recursive: true }),
    mkdir(join(ctx.dir, 'transcripts/session-1/subagents'), { recursive: true }),
  ]);

  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');
  await writeFile(join(ctx.dir, '.claude/skills/project-testing/SKILL.md'), '# Project testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcripts/session-1/subagents/agent-a1b2c3.jsonl'),
    [
      '{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","isSidechain":true,"message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"project-testing"}}]}}',
      '{"type":"user","isSidechain":true,"message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: project-testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      session_id: 'session-1',
      transcript_path: join(ctx.dir, 'transcripts/session-1.jsonl'),
      agent_id: 'a1b2c3',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.dir, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it denies a subagent edit when only the main session loaded the skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, 'transcripts/session-1/subagents'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcripts/session-1.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  await writeFile(
    join(ctx.dir, 'transcripts/session-1/subagents/agent-a1b2c3.jsonl'),
    '{"type":"user","isSidechain":true,"message":{"content":"Write src/a.test.ts"}}',
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      session_id: 'session-1',
      transcript_path: join(ctx.dir, 'transcripts/session-1.jsonl'),
      agent_id: 'a1b2c3',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.dir, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.dir, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it denies a subagent edit when the subagent has no transcript', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, 'transcripts'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcripts/session-1.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      session_id: 'session-1',
      transcript_path: join(ctx.dir, 'transcripts/session-1.jsonl'),
      agent_id: 'a1b2c3',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.dir, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.dir, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it denies a subagent edit whose agent id climbs out of the subagents folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, 'transcripts'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcripts/session-1.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      session_id: 'session-1',
      transcript_path: join(ctx.dir, 'transcripts/session-1.jsonl'),
      agent_id: 'x/../../../session-1',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.dir, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.dir, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it denies an edit after a compaction and says to load the skills again', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted","compactMetadata":{"trigger":"manual"}}',
      '{"type":"attachment","attachment":{"type":"invoked_skills","skills":[{"name":"testing","path":"projectSettings:testing","content":"# Testing"}]}}',
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

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill again with the Skill tool before editing ${join(ctx.dir, 'src/a.test.ts')}, then retry the edit. This session was compacted, and a skill loaded before the compaction no longer counts. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
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
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.dir, 'a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it stays silent on a Bash command that writes no file', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'), { recursive: true });

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it gates a project file whose name starts with two dots', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.dir, '..dots.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.dir, '..dots.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test.each([
  ["sed -i 's/oldName/newName/' src/a.test.ts"],
  ["echo 'export {};' > src/a.test.ts"],
  ["echo 'export {};' >> src/a.test.ts"],
  ["printf 'export {};' | tee src/a.test.ts"],
  ['cp drafts/a.ts src/a.test.ts'],
  ['mv drafts/a.ts src/a.test.ts'],
  ["cd src && sed -i.bak -e 's/oldName/newName/' a.test.ts"],
  [`python3 -c "open('src/a.test.ts', 'w').write('export {};')"`],
])('it denies the Bash command %s with the Edit-tool message', async (command) => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, 'src'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${join(ctx.dir, 'src/a.test.ts')} is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. Load the \`testing\` skill with the Skill tool first. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test.each([
  ["sed -n '1,20p' src/a.test.ts"],
  ['cat src/a.test.ts'],
  ['grep -n oldName src/a.test.ts'],
  ["sed -i 's/oldName/newName/' src/a.ts"],
  ["echo 'draft' > notes.txt"],
  ['cp src/a.test.ts drafts/a.test.ts.bak'],
  ["echo 'unclosed > src/a.test.ts"],
])('it lets the Bash command %s go ahead in silence', async (command) => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it denies a Bash write to a gated path after the session loads the skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.dir, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "sed -i 's/oldName/newName/' src/a.test.ts" },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${join(ctx.dir, 'src/a.test.ts')} is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it denies a Bash copy into a directory when the copied file name is gated', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, 'src'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'cp drafts/b.test.ts src' },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${join(ctx.dir, 'src/b.test.ts')} is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. Load the \`testing\` skill with the Skill tool first. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it lets a Bash write to a gated path go ahead in a repo without a rules file', async () => {
  const ctx = await setupTest();

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "sed -i 's/oldName/newName/' src/a.test.ts" },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it lets a Bash write to a gated path go ahead when the rules file is not JSON', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skill-gate.json'), '{ "gates": [');

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "sed -i 's/oldName/newName/' src/a.test.ts" },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it denies a Bash command that writes paths under two gates and names every skill', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.dir, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.dir, '.claude/skills/testing/SKILL.md'), '# Testing\n');
  await writeFile(join(ctx.dir, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.dir, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [
        { match: '**/*.test.ts', skills: ['testing'] },
        { match: '**/*.md', skills: ['docs-writing'] },
      ],
    }),
  );

  const result = spawnSync('bun', [ctx.hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.dir },
    input: JSON.stringify({
      cwd: ctx.dir,
      transcript_path: join(ctx.dir, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "printf 'draft' | tee src/a.test.ts README.md" },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${join(ctx.dir, 'src/a.test.ts')}, ${join(ctx.dir, 'README.md')} are gated paths, so change them with the Edit, Write or MultiEdit tool, never through Bash. Load the \`testing\` and \`docs-writing\` skills with the Skill tool first. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});
