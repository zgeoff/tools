import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // The hook process runs the gate as a repo's entry point does: it imports runSkillGate and awaits
  // it, so each test sees the exit code and the output a repo sees.
  const indexPath = fileURLToPath(new URL('index.ts', import.meta.url));

  const hookArgs = [
    '--eval',
    `const { runSkillGate } = await import(${JSON.stringify(indexPath)}); await runSkillGate();`,
  ];

  return { directory, hookArgs };
}

test('it denies a test file edit until the session loads both testing skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, '.claude/skills/project-testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skills/project-testing/SKILL.md'),
    '# Project testing\n',
  );

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`project-testing\` skill with the Skill tool before editing ${join(ctx.directory, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it allows a test file edit once the session loads both testing skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, '.claude/skills/project-testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skills/project-testing/SKILL.md'),
    '# Project testing\n',
  );

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"project-testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: project-testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it allows a subagent edit once the subagent loads both testing skills', async () => {
  const ctx = await setupTest();

  await Promise.all([
    mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true }),
    mkdir(join(ctx.directory, '.claude/skills/project-testing'), { recursive: true }),
    mkdir(join(ctx.directory, 'transcripts/session-1/subagents'), { recursive: true }),
  ]);

  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skills/project-testing/SKILL.md'),
    '# Project testing\n',
  );

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing', 'project-testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcripts/session-1/subagents/agent-a1b2c3.jsonl'),
    [
      '{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","isSidechain":true,"message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"project-testing"}}]}}',
      '{"type":"user","isSidechain":true,"message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: project-testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      session_id: 'session-1',
      transcript_path: join(ctx.directory, 'transcripts/session-1.jsonl'),
      agent_id: 'a1b2c3',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it denies a subagent edit when only the main session loaded the skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, 'transcripts/session-1/subagents'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcripts/session-1.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  await writeFile(
    join(ctx.directory, 'transcripts/session-1/subagents/agent-a1b2c3.jsonl'),
    '{"type":"user","isSidechain":true,"message":{"content":"Write src/a.test.ts"}}',
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      session_id: 'session-1',
      transcript_path: join(ctx.directory, 'transcripts/session-1.jsonl'),
      agent_id: 'a1b2c3',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.directory, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it denies a subagent edit when the subagent has no transcript', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, 'transcripts'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcripts/session-1.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      session_id: 'session-1',
      transcript_path: join(ctx.directory, 'transcripts/session-1.jsonl'),
      agent_id: 'a1b2c3',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.directory, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it denies a subagent edit whose agent id climbs out of the subagents folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, 'transcripts'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcripts/session-1.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      session_id: 'session-1',
      transcript_path: join(ctx.directory, 'transcripts/session-1.jsonl'),
      agent_id: 'x/../../../session-1',
      agent_type: 'general-purpose',
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.directory, 'src/a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it denies an edit after a compaction and says to load the skills again', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted","compactMetadata":{"trigger":"manual"}}',
      '{"type":"attachment","attachment":{"type":"invoked_skills","skills":[{"name":"testing","path":"projectSettings:testing","content":"# Testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill again with the Skill tool before editing ${join(ctx.directory, 'src/a.test.ts')}, then retry the edit. This session was compacted, and a skill loaded before the compaction no longer counts. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it stays silent in a repo without a rules file', async () => {
  const ctx = await setupTest();

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it warns and allows the edit when a rule names a skill the repo does not have', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude'), { recursive: true });

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'README.md') },
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

  await mkdir(join(ctx.directory, '.claude'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skill-gate.json'), '{ "gates": [');

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/a.ts') },
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

  await mkdir(join(ctx.directory, 'project/.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, 'project/.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, 'project/.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: join(ctx.directory, 'project') },
    input: JSON.stringify({
      cwd: join(ctx.directory, 'project'),
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'scratch/a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it reads the project root from the payload cwd when CLAUDE_PROJECT_DIR is unset', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'a.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.directory, 'a.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it stays silent on a Bash command that writes no file', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude'), { recursive: true });

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it gates a project file whose name starts with two dots', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, '..dots.test.ts') },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`testing\` skill with the Skill tool before editing ${join(ctx.directory, '..dots.test.ts')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
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
  [`perl -e 'open my $fh, ">", "src/a.test.ts";'`],
])('it warns on the Bash command %s with the Edit-tool message', async (command) => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, 'src'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `skill-gate: this Bash command writes a gated path and runs anyway. Load the \`testing\` skill with the Skill tool before the next change. ${join(ctx.directory, 'src/a.test.ts')} is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
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

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it warns on a Bash write to a gated path after the session loads the skills', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "sed -i 's/oldName/newName/' src/a.test.ts" },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `skill-gate: this Bash command writes a gated path and runs anyway. ${join(ctx.directory, 'src/a.test.ts')} is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it warns on a Bash copy into a directory when the copied file name is gated', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, 'src'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'cp drafts/b.test.ts src' },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `skill-gate: this Bash command writes a gated path and runs anyway. Load the \`testing\` skill with the Skill tool before the next change. ${join(ctx.directory, 'src/b.test.ts')} is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it lets a Bash write to a gated path go ahead in a repo without a rules file', async () => {
  const ctx = await setupTest();

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "sed -i 's/oldName/newName/' src/a.test.ts" },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it lets a Bash write to a gated path go ahead when the rules file is not JSON', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skill-gate.json'), '{ "gates": [');

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "sed -i 's/oldName/newName/' src/a.test.ts" },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it warns on a Bash command that writes paths under two gates and names every skill', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(ctx.directory, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');
  await writeFile(join(ctx.directory, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [
        { match: '**/*.test.ts', skills: ['testing'] },
        { match: '**/*.md', skills: ['docs-writing'] },
      ],
    }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "printf 'draft' | tee src/a.test.ts README.md" },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `skill-gate: this Bash command writes a gated path and runs anyway. Load the \`testing\` and \`docs-writing\` skills with the Skill tool before the next change. ${join(ctx.directory, 'src/a.test.ts')}, ${join(ctx.directory, 'README.md')} are gated paths, so change them with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it lets a Bash write to a gated file name outside the project go ahead', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'repo/.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, 'repo/.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, 'repo/.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: join(ctx.directory, 'repo') },
    input: JSON.stringify({
      cwd: join(ctx.directory, 'repo'),
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: `echo 'draft' > ${join(ctx.directory, 'other/a.test.ts')}` },
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it warns on a Bash write to a gated path after a compaction and says to load the skills again', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/testing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'transcript.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted","compactMetadata":{"trigger":"manual"}}',
    ].join('\n'),
  );

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: "sed -i 's/oldName/newName/' src/a.test.ts" },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `skill-gate: this Bash command writes a gated path and runs anyway. Load the \`testing\` skill again with the Skill tool before the next change. This session was compacted, and a skill loaded before the compaction no longer counts. ${join(ctx.directory, 'src/a.test.ts')} is a gated path, so change it with the Edit, Write or MultiEdit tool, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it blocks after a Bash command changes a gated file before the session loads its skills', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    decision: 'block',
    reason: `skill-gate: this Bash command changed the gated path ${join(project, 'src/a.test.ts')} before the session loaded the skills it needs. Load the \`testing\` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
  });
});

test('it lets a Bash change to a gated file through once the session loads its skills', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'session.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it lets a Bash command through when a gated file was dirty before and the command left it alone', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds down', () => {});\n");

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'notes.txt'), 'draft\n');

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it blocks after a Bash command rewrites a gated file that was dirty before', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds down', () => {});\n");

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    decision: 'block',
    reason: `skill-gate: this Bash command changed the gated path ${join(project, 'src/a.test.ts')} before the session loaded the skills it needs. Load the \`testing\` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
  });
});

test('it lets a Bash change to a file no gate matches through', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.ts'), 'export const rate = 2;\n');

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it blocks after a Bash change that follows a compaction and says to load the skills again', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'session.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted","compactMetadata":{"trigger":"manual"}}',
    ].join('\n'),
  );

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    decision: 'block',
    reason: `skill-gate: this Bash command changed the gated path ${join(project, 'src/a.test.ts')} before the session loaded the skills it needs. Load the \`testing\` skill again with the Skill tool, then review what the command changed against it and fix what breaks a rule. This session was compacted, and a skill loaded before the compaction no longer counts. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
  });
});

test('it lets a Bash change after a compaction through once the session loads the skills again', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(
    join(ctx.directory, 'session.jsonl'),
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: testing"}]}}',
      '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted","compactMetadata":{"trigger":"manual"}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"testing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: testing"}]}}',
    ].join('\n'),
  );

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it lets a Bash commit of a gated file that was dirty before through', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds down', () => {});\n");

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await $`git add -A && git commit --quiet -m wip`.cwd(project).env({
    PATH: process.env['PATH'],
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  });

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it blocks after a Bash command changes a clean gated file and commits it', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds down', () => {});\n");

  await $`git add -A && git commit --quiet -m wip`.cwd(project).env({
    PATH: process.env['PATH'],
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  await $`git add -A && git commit --quiet -m wip`.cwd(project).env({
    PATH: process.env['PATH'],
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  });

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    decision: 'block',
    reason: `skill-gate: this Bash command changed the gated path ${join(project, 'src/a.test.ts')} before the session loaded the skills it needs. Load the \`testing\` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
  });
});

test('it blocks after a Bash command adds a gated file in the first commit', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  await $`git add -A && git commit --quiet -m wip`.cwd(project).env({
    PATH: process.env['PATH'],
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  });

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    decision: 'block',
    reason: `skill-gate: this Bash command changed the gated path ${join(project, 'src/a.test.ts')} before the session loaded the skills it needs. Load the \`testing\` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
  });
});

test('it gives the reason as context after a failed Bash command changes a gated file', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUseFailure',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext: `skill-gate: this Bash command changed the gated path ${join(project, 'src/a.test.ts')} before the session loaded the skills it needs. Load the \`testing\` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it blocks after a Bash change when the session environment sets GIT_EDITOR', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project, GIT_EDITOR: 'true' },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  await writeFile(join(project, 'src/a.test.ts'), "test('it rounds up', () => {});\n");

  const result = spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project, GIT_EDITOR: 'true' },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toStrictEqual({
    decision: 'block',
    reason: `skill-gate: this Bash command changed the gated path ${join(project, 'src/a.test.ts')} before the session loaded the skills it needs. Load the \`testing\` skill with the Skill tool, then review what the command changed against it and fix what breaks a rule. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
  });
});

test('it removes the record of the dirty files once the Bash command is checked', async () => {
  const ctx = await setupTest();

  const project = join(ctx.directory, 'project');

  await mkdir(join(project, '.claude/skills/testing'), { recursive: true });
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, '.claude/skills/testing/SKILL.md'), '# Testing\n');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.test.ts', skills: ['testing'] }] }),
  );

  await writeFile(join(ctx.directory, 'session.jsonl'), '');

  await $`git init --quiet`.cwd(project).env({ PATH: process.env['PATH'] });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  spawnSync('bun', ctx.hookArgs, {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: project,
      transcript_path: join(ctx.directory, 'session.jsonl'),
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/stamp.mjs' },
      tool_use_id: 'toolu_bash_1',
    }),
  });

  const records = await readdir(join(ctx.directory, 'session/skill-gate'));

  expect(records).toStrictEqual([]);
});
