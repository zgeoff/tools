import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubInstall } from '../../test-utils/create-stub-install.ts';
import { readStreamUntil } from '../../test-utils/read-stream-until.ts';

// The stub installs with the bun on PATH and runs the retry with its own runtime, so a stand-in bun
// first on PATH stands in for the install alone. Its installed package re-exports this repo's
// source, so the gate that runs after the install is the real one.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'agent-hooks-start-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const project = join(directory, 'project');
  const fakeBin = join(directory, 'bin');
  const packageDir = join(directory, 'package');
  const installLog = join(directory, 'install.log');
  const stubPath = join(project, '.claude/hooks/start.ts');

  await mkdir(join(project, '.claude/hooks'), { recursive: true });
  await mkdir(join(project, '.claude/skills/docs-writing'), { recursive: true });
  await mkdir(fakeBin);
  await mkdir(packageDir);
  await copyFile(join(import.meta.dir, 'start.ts'), stubPath);
  await writeFile(join(project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');
  await writeFile(join(project, 'transcript.jsonl'), '');

  await writeFile(
    join(project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: '@zgeoff/agent-hooks', type: 'module', exports: './index.ts' }),
  );

  await writeFile(
    join(packageDir, 'index.ts'),
    `export * from ${JSON.stringify(join(import.meta.dir, '../../packages/agent-hooks/src/index.ts'))};\n`,
  );

  const env = {
    PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
    HOME: process.env['HOME'] ?? '',
    CLAUDE_PROJECT_DIR: project,
  };

  const buildPayload = (toolName: string, toolInput: Readonly<Record<string, unknown>>) =>
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: project,
      transcript_path: join(project, 'transcript.jsonl'),
      tool_name: toolName,
      tool_input: toolInput,
    });

  const runStub = (payload: string, args: readonly string[] = []) =>
    spawnSync(process.execPath, ['--no-install', stubPath, ...args], {
      encoding: 'utf8',
      env,
      input: payload,
    });

  const startStub = (payload: string) => {
    const child = Bun.spawn([process.execPath, '--no-install', stubPath], {
      env,
      stdin: new Blob([payload]),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    onTestFinished(() => {
      child.kill();
    });

    return child;
  };

  const readInstallLog = async () => {
    try {
      return await readFile(installLog, 'utf8');
    } catch {
      return '';
    }
  };

  const gatedEdit = buildPayload('Write', { file_path: join(project, 'guide.md') });
  const gateReason = `Load the \`docs-writing\` skill with the Skill tool before editing ${join(project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`;

  return {
    directory,
    project,
    fakeBin,
    packageDir,
    installLog,
    buildPayload,
    runStub,
    startStub,
    readInstallLog,
    gatedEdit,
    gateReason,
  };
}

test('it installs the missing package in a fresh worktree, then blocks a gated edit with the gate reason', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  const result = ctx.runStub(ctx.gatedEdit);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(`stub install started\n${ctx.gateReason}`);

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it allows an ungated edit after the install with no output', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'main.ts') }),
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it runs no install when the package loads', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  ctx.runStub(ctx.gatedEdit);

  const result = ctx.runStub(ctx.gatedEdit);

  expect(result.status).toBe(2);
  expect(result.stderr).toBe(ctx.gateReason);

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it refuses a gated edit with the install message when the install fails', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(ctx.gatedEdit);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('stub install started\nTo work here, run bun install.\n');
});

// A parser cannot see a gated path that the shell builds, so any shell syntax refuses the command.
test.each([
  'ext=ts; printf x > packages/core/src/sample.$ext',
  'printf x > guide.md',
  'cat notes.txt | tee guide.md',
  'cp notes.txt guide.md',
  'bun install left-pad',
  'git diff --output=guide.md',
  'git diff',
  'git diff --no-ext-diff',
  'git diff --no-ext-diff --no-textconv --ext-diff',
  'git diff --no-ext-diff --no-textconv --ext-dif --no-index notes.txt guide.md',
  'git diff --no-ext-diff --no-textconv --stat',
  'git status',
  'cat "$(echo guide.md)"',
])('it refuses the Bash command %s when the install fails', async (command) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(ctx.buildPayload('Bash', { command }));

  expect(result.status).toBe(2);
  expect(result.stderr).toEndWith('To work here, run bun install.\n');
});

test.each([
  { label: 'a line break', command: 'pwd\nls' },
  { label: 'a carriage return', command: 'pwd\rls' },
  { label: 'a tab', command: 'ls\tsrc' },
  { label: 'a semicolon', command: 'pwd;ls' },
  { label: 'an ampersand', command: 'pwd&ls' },
  { label: 'a pipe', command: 'ls|cat' },
  { label: 'a backtick', command: 'cat `ls`' },
  { label: 'a command substitution', command: 'cat $(ls)' },
  { label: 'an output redirect', command: 'ls >listing.txt' },
  { label: 'an input redirect', command: 'cat <package.json' },
  { label: 'a control character', command: 'pwd\u0007' },
  { label: 'a leading space', command: ' pwd' },
])('it refuses a Bash command with $label when the install fails', async (row) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(ctx.buildPayload('Bash', { command: row.command }));

  expect(result.status).toBe(2);
  expect(result.stderr).toEndWith('To work here, run bun install.\n');
});

test.each([
  'bun install',
  'bun install --frozen-lockfile',
  'ls -la src',
  'cat package.json',
  'pwd',
])('it allows the read-only Bash command %s when the install fails', async (command) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(ctx.buildPayload('Bash', { command }));

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it refuses a gated tool call when the install fails', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(ctx.buildPayload('mcp__tracker__update_ticket', { title: 'Draft' }));

  expect(result.status).toBe(2);
  expect(result.stderr).toEndWith('To work here, run bun install.\n');
});

test('it lets a prompt through when the install fails, so a person can still ask for the install', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: ctx.project, prompt: 'Install it' }),
    ['--harness', 'codex'],
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test('it runs one install for two parallel hook calls in one worktree', async () => {
  const ctx = await setupTest();

  const releasePath = join(ctx.directory, 'release');

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
    releasePath,
  });

  const first = ctx.startStub(ctx.gatedEdit);

  await readStreamUntil(first.stderr, 'stub install started');

  const second = ctx.startStub(ctx.gatedEdit);

  const waiting = await readStreamUntil(second.stderr, 'Another agent hook runs bun install here');

  await writeFile(releasePath, '');

  const decided = await readStreamUntil(second.stderr, 'lists the skills each path needs.');
  const firstStatus = await first.exited;
  const secondStatus = await second.exited;

  expect(firstStatus).toBe(2);
  expect(secondStatus).toBe(2);

  expect(`${waiting}${decided}`).toBe(
    `Another agent hook runs bun install here, so this one waits for it.\n${ctx.gateReason}`,
  );

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it installs over a lock that a stopped hook left behind', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  const stopped = spawnSync('true');

  await mkdir(join(ctx.project, 'node_modules'));
  await writeFile(join(ctx.project, 'node_modules/.agent-hooks-install.lock'), String(stopped.pid));

  const result = ctx.runStub(ctx.gatedEdit);

  expect(result.status).toBe(2);
  expect(result.stderr).toBe(`stub install started\n${ctx.gateReason}`);
});

test.each([
  { label: 'empty', contents: '' },
  { label: 'not a process id', contents: 'install' },
])('it installs over a lock whose contents are $label', async (row) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  await mkdir(join(ctx.project, 'node_modules'));
  await writeFile(join(ctx.project, 'node_modules/.agent-hooks-install.lock'), row.contents);

  const result = ctx.runStub(ctx.gatedEdit);

  expect(result.status).toBe(2);
  expect(result.stderr).toBe(`stub install started\n${ctx.gateReason}`);
});

test('it refuses a harness it does not know', async () => {
  const ctx = await setupTest();

  const result = ctx.runStub(ctx.gatedEdit, ['--harness', 'cursor']);

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    'The agent hook does not know the harness cursor. Use codex or claude-code.\n',
  );
});
