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

test('it blocks a gated edit and names the load failure when the repo lacks @zgeoff/skill-gate', async () => {
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

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');

  expect(result.stderr).toContain(
    `The skill gate cannot load, so it blocks this edit to ${join(ctx.directory, 'guide.md')}: Cannot find package '@zgeoff/skill-gate'`,
  );
});

test('it blocks a gated edit to a path relative to cwd when the gate cannot load', async () => {
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
      cwd: join(ctx.directory, 'docs'),
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: 'guide.md' },
    }),
  });

  expect(result.status).toBe(2);

  expect(result.stderr).toContain(
    `The skill gate cannot load, so it blocks this edit to ${join(ctx.directory, 'docs/guide.md')}: Cannot find package '@zgeoff/skill-gate'`,
  );
});

test('it blocks a gated edit and names the load failure when a dependency of @zgeoff/skill-gate is missing', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');
  const packageDir = join(ctx.directory, 'node_modules/@zgeoff/skill-gate');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);
  await mkdir(packageDir, { recursive: true });

  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: '@zgeoff/skill-gate', type: 'module', exports: './index.js' }),
  );

  await writeFile(
    join(packageDir, 'index.js'),
    "import { isRecord } from '@zgeoff/std';\nexport const runSkillGate = isRecord;\n",
  );

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

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');

  expect(result.stderr).toContain(
    `The skill gate cannot load, so it blocks this edit to ${join(ctx.directory, 'guide.md')}: Cannot find package '@zgeoff/std'`,
  );
});

test('it blocks an edit inside the project when the gate cannot load and the rules file does not parse', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);
  await writeFile(join(ctx.directory, '.claude/skill-gate.json'), '{ "gates": [');

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/index.ts') },
    }),
  });

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Cannot find package '@zgeoff/skill-gate'");
});

test('it blocks an edit inside the project when the gate cannot load and a gate names no skills', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: [] }] }),
  );

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/index.ts') },
    }),
  });

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Cannot find package '@zgeoff/skill-gate'");
});

test('it blocks an edit inside the project and names both errors when the gate cannot load or read the rules file', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');
  const rulesPath = join(ctx.directory, '.claude/skill-gate.json');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

  // A folder in the file's place fails the read for root too, which a chmod does not.
  await mkdir(rulesPath);

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { file_path: join(ctx.directory, 'src/index.ts') },
    }),
  });

  expect(result.status).toBe(2);
  expect(result.stderr).toContain('The skill gate cannot read .claude/skill-gate.json:');

  expect(result.stderr).toContain(
    `The skill gate cannot load, so it blocks this edit to ${join(ctx.directory, 'src/index.ts')}: Cannot find package '@zgeoff/skill-gate'`,
  );
});

test.each([
  ['a path that no gate matches', { file_path: 'src/index.ts' }],
  ['a path that holds an ignore segment', { file_path: 'dist/guide.md' }],
  ['a path outside the project', { file_path: '../notes/guide.md' }],
  ['a Bash command that writes a gated path', { command: 'echo hello > guide.md' }],
])(
  'it lets %s run with the load error on stderr when the gate cannot load',
  async (_label, toolInput) => {
    const ctx = await setupTest();

    const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

    await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
    await copyFile(ctx.hookPath, copiedHookPath);

    await writeFile(
      join(ctx.directory, '.claude/skill-gate.json'),
      JSON.stringify({
        ignore: ['dist/'],
        gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
      }),
    );

    const result = spawnSync('bun', [copiedHookPath], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
      input: JSON.stringify({
        cwd: ctx.directory,
        transcript_path: join(ctx.directory, 'transcript.jsonl'),
        tool_input: toolInput,
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');

    expect(result.stderr).toContain(
      "The skill gate cannot load: Cannot find package '@zgeoff/skill-gate'",
    );
  },
);

test('it lets an edit run with the load error on stderr when the gate cannot load in a repo with no rules file', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

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

  expect(result.stderr).toContain(
    "The skill gate cannot load: Cannot find package '@zgeoff/skill-gate'",
  );
});

test('it blocks a gated tool call and names the load failure when the repo lacks @zgeoff/skill-gate', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [],
      tools: [{ tool: 'mcp__tracker__update_ticket', skills: ['ticket-review'] }],
    }),
  );

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'mcp__tracker__update_ticket',
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { title: 'Rotate the staging keys' },
    }),
  });

  expect(result.status).toBe(2);

  expect(result.stderr).toContain(
    "The skill gate cannot load, so it blocks this call to mcp__tracker__update_ticket: Cannot find package '@zgeoff/skill-gate'",
  );
});

test('it lets a tool call that no tool gate names run when the gate cannot load', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [],
      tools: [{ tool: 'mcp__tracker__update_ticket', skills: ['ticket-review'] }],
    }),
  );

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'mcp__tracker__read_ticket',
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { id: 'ENG-12' },
    }),
  });

  expect(result.status).toBe(1);

  expect(result.stderr).toContain(
    "The skill gate cannot load: Cannot find package '@zgeoff/skill-gate'",
  );
});

test('it blocks a tool call when the gate cannot load and the tools list does not parse', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [], tools: [{ skills: ['ticket-review'] }] }),
  );

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'mcp__tracker__read_ticket',
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_input: { id: 'ENG-12' },
    }),
  });

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Cannot find package '@zgeoff/skill-gate'");
});
