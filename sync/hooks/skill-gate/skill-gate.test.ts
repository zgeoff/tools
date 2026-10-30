import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The delivered entry point resolves @zgeoff/skill-gate from this repo's workspace, as a repo's
// copy resolves it from its own node_modules. A copy that cannot load sits in an installed repo,
// with a node_modules folder, because Bun auto-installs a missing package from npm without one.
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

test.each([
  ['a Write to a gated path', 'Write', { file_path: 'guide.md', content: '# Guide\n' }],
  [
    'an Edit to a path that no gate matches',
    'Edit',
    { file_path: 'notes.txt', old_string: 'draft', new_string: 'final' },
  ],
  ['a Write outside the project', 'Write', { file_path: '../notes/guide.md', content: 'x' }],
  ['a Bash command that writes a gated path', 'Bash', { command: 'echo hello > guide.md' }],
  [
    'a Bash command that builds a gated path from a variable',
    'Bash',
    { command: 'ext=ts; printf x > packages/core/src/sample.$ext' },
  ],
  ['a read-only command chained to a write', 'Bash', { command: 'pwd && rm guide.md' }],
  ['a read-only command on a line before a write', 'Bash', { command: 'ls\nrm guide.md' }],
  [
    'git diff that writes its output to a file',
    'Bash',
    { command: 'git diff --no-ext-diff --no-textconv --output=changes.patch' },
  ],
  ['bun install that adds a package', 'Bash', { command: 'bun install left-pad' }],
  ['a plain git diff', 'Bash', { command: 'git diff' }],
  ['git status', 'Bash', { command: 'git status' }],
  [
    'git diff that turns the external diff program back on',
    'Bash',
    { command: 'git diff --no-ext-diff --no-textconv --ext-diff' },
  ],
  [
    'git diff that turns the textconv drivers back on',
    'Bash',
    { command: 'git diff --no-ext-diff --no-textconv --textconv' },
  ],
  ['cat with a glob', 'Bash', { command: 'cat docs/*.md' }],
  ['cat with a quoted path', 'Bash', { command: "cat 'docs/guide.md'" }],
  ['a call to a tool with no gate', 'mcp__tracker__read_ticket', { id: 'ENG-12' }],
])('it blocks %s when the gate cannot load', async (_label, toolName, toolInput) => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await mkdir(join(ctx.directory, 'node_modules'));
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [
        { match: '**/*.md', skills: ['docs-writing'] },
        { match: '**/*.ts', skills: ['code-style'] },
      ],
    }),
  );

  const result = spawnSync('bun', ['--no-install', copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: toolName,
      tool_input: toolInput,
    }),
  });

  expect({ status: result.status, stdout: result.stdout }).toStrictEqual({ status: 2, stdout: '' });

  expect(result.stderr).toContain(
    `The skill gate cannot load, so it blocks this call to ${toolName}: Cannot find package '@zgeoff/skill-gate'`,
  );

  expect(result.stderr).toContain('To work here, run bun install.');
});

test.each([
  'bun install',
  'bun install --frozen-lockfile',
  'git diff --no-ext-diff --no-textconv --stat',
  'ls packages',
  'cat package.json',
  'pwd',
])('it lets the read-only command %p run when the gate cannot load', async (command) => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await mkdir(join(ctx.directory, 'node_modules'));
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [
        { match: '**/*.md', skills: ['docs-writing'] },
        { match: '**/*.ts', skills: ['code-style'] },
      ],
    }),
  );

  const result = spawnSync('bun', ['--no-install', copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Bash',
      tool_input: { command },
    }),
  });

  expect({ status: result.status, stdout: result.stdout }).toStrictEqual({ status: 1, stdout: '' });

  expect(result.stderr).toContain(
    "The skill gate cannot load: Cannot find package '@zgeoff/skill-gate'",
  );
});

test.each(['PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit'])(
  'it lets a %s event through when the gate cannot load',
  async (event) => {
    const ctx = await setupTest();

    const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

    await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
    await mkdir(join(ctx.directory, 'node_modules'));
    await copyFile(ctx.hookPath, copiedHookPath);

    await writeFile(
      join(ctx.directory, '.claude/skill-gate.json'),
      JSON.stringify({
        gates: [
          { match: '**/*.md', skills: ['docs-writing'] },
          { match: '**/*.ts', skills: ['code-style'] },
        ],
      }),
    );

    const result = spawnSync('bun', ['--no-install', copiedHookPath], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
      input: JSON.stringify({
        hook_event_name: event,
        cwd: ctx.directory,
        transcript_path: join(ctx.directory, 'transcript.jsonl'),
        tool_name: 'Bash',
        tool_input: { command: 'echo hello > guide.md' },
      }),
    });

    expect({ status: result.status, stdout: result.stdout }).toStrictEqual({
      status: 0,
      stdout: '',
    });
  },
);

test('it blocks an edit when the hook command passes --no-install and the repo has no node_modules', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [
        { match: '**/*.md', skills: ['docs-writing'] },
        { match: '**/*.ts', skills: ['code-style'] },
      ],
    }),
  );

  const result = spawnSync('bun', ['--no-install', copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Write',
      tool_input: { file_path: join(ctx.directory, 'guide.md'), content: '# Guide\n' },
    }),
  });

  expect({ status: result.status, stdout: result.stdout }).toStrictEqual({ status: 2, stdout: '' });

  expect(result.stderr).toContain(
    "The skill gate cannot load, so it blocks this call to Write: Cannot find package '@zgeoff/skill-gate'",
  );
});

test('it blocks an edit and names the load failure when a dependency of @zgeoff/skill-gate is missing', async () => {
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
    JSON.stringify({
      gates: [
        { match: '**/*.md', skills: ['docs-writing'] },
        { match: '**/*.ts', skills: ['code-style'] },
      ],
    }),
  );

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      cwd: ctx.directory,
      transcript_path: join(ctx.directory, 'transcript.jsonl'),
      tool_name: 'Write',
      tool_input: { file_path: join(ctx.directory, 'guide.md'), content: '# Guide\n' },
    }),
  });

  expect({ status: result.status, stdout: result.stdout }).toStrictEqual({ status: 2, stdout: '' });

  expect(result.stderr).toContain(
    "The skill gate cannot load, so it blocks this call to Write: Cannot find package '@zgeoff/std'",
  );
});

test('it denies a gated apply_patch edit through the entry point when given --harness codex', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath, '--harness', 'codex'], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      transcript_path: join(ctx.directory, 'rollout.jsonl'),
      cwd: ctx.directory,
      tool_name: 'apply_patch',
      tool_use_id: 'call-1',
      tool_input: { command: '*** Begin Patch\n*** Add File: guide.md\n+# Guide\n*** End Patch' },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toMatchObject({
    hookSpecificOutput: {
      permissionDecisionReason: expect.stringContaining(
        `${join(ctx.directory, 'guide.md')} needs the \`docs-writing\` skill`,
      ),
    },
  });
});

test.each([
  ['apply_patch', { command: '*** Begin Patch\n*** Add File: notes.txt\n+x\n*** End Patch' }],
  ['Bash', { command: 'echo hello > guide.md' }],
])(
  'it blocks the %s call when the gate cannot load and the harness is codex',
  async (toolName, toolInput) => {
    const ctx = await setupTest();

    const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

    await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
    await mkdir(join(ctx.directory, 'node_modules'));
    await copyFile(ctx.hookPath, copiedHookPath);

    const result = spawnSync('bun', ['--no-install', copiedHookPath, '--harness', 'codex'], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] },
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        cwd: ctx.directory,
        tool_name: toolName,
        tool_input: toolInput,
      }),
    });

    expect({ status: result.status, stdout: result.stdout }).toStrictEqual({
      status: 2,
      stdout: '',
    });

    expect(result.stderr).toContain(
      `The skill gate cannot load, so it blocks this call to ${toolName}: Cannot find package '@zgeoff/skill-gate'`,
    );
  },
);

test('it refuses a harness it does not know', async () => {
  const ctx = await setupTest();

  const result = spawnSync('bun', [ctx.hookPath, '--harness', 'cursor'], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] },
    input: '{}',
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('does not know the harness cursor');
});

test('it reads --harness=codex in the joined form', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.directory, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  const result = spawnSync('bun', [ctx.hookPath, '--harness=codex'], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      transcript_path: join(ctx.directory, 'rollout.jsonl'),
      cwd: ctx.directory,
      tool_name: 'apply_patch',
      tool_use_id: 'call-1',
      tool_input: { command: '*** Begin Patch\n*** Add File: guide.md\n+# Guide\n*** End Patch' },
    }),
  });

  expect(result.status).toBe(0);

  expect(JSON.parse(result.stdout)).toMatchObject({
    hookSpecificOutput: {
      permissionDecisionReason: expect.stringContaining(
        `${join(ctx.directory, 'guide.md')} needs the \`docs-writing\` skill`,
      ),
    },
  });
});

test.each([
  [['--harness'], "Option '--harness <value>' argument missing"],
  [['--harnes', 'codex'], "Unknown option '--harnes'"],
])('it refuses the arguments %p and names the fault', async (args, fault) => {
  const ctx = await setupTest();

  const result = spawnSync('bun', [ctx.hookPath, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] },
    input: '{}',
  });

  expect({ status: result.status, stdout: result.stdout }).toStrictEqual({ status: 1, stdout: '' });
  expect(result.stderr).toStartWith(`The skill gate cannot read its arguments: ${fault}`);
});

test('it blocks a call when the gate cannot load and the payload is not JSON', async () => {
  const ctx = await setupTest();

  const copiedHookPath = join(ctx.directory, '.claude/hooks/skill-gate/skill-gate.ts');

  await mkdir(join(ctx.directory, '.claude/hooks/skill-gate'), { recursive: true });
  await mkdir(join(ctx.directory, 'node_modules'));
  await copyFile(ctx.hookPath, copiedHookPath);

  await writeFile(
    join(ctx.directory, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  const result = spawnSync('bun', [copiedHookPath], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: ctx.directory },
    input: 'not a payload',
  });

  expect({ status: result.status, stdout: result.stdout }).toStrictEqual({ status: 2, stdout: '' });

  expect(result.stderr).toContain(
    "The skill gate cannot load, so it blocks this call: Cannot find package '@zgeoff/skill-gate'",
  );
});
