import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubInstall } from '../../test-utils/create-stub-install.ts';
import { readStreamUntil } from '../../test-utils/read-stream-until.ts';
import { readTextOrEmpty } from '../../test-utils/read-text-or-empty.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { pickClaimStep } from './start.ts';

// Root ignores file modes, so a folder or a lock with no permissions cannot stop root from using it.
const isRoot = process.getuid?.() === 0;

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
  await mkdir(fakeBin);
  await mkdir(packageDir);
  await copyFile(join(import.meta.dir, 'start.ts'), stubPath);

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
      detached: true,
    });

    // A test that fails before it releases an install leaves the install waiting under the hook, so
    // the cleanup stops the whole process group, which detached gives the hook.
    onTestFinished(() => {
      Bun.spawnSync(['kill', '-KILL', '--', `-${child.pid}`]);
    });

    return child;
  };

  const readInstallLog = () => readTextOrEmpty(installLog);

  return {
    directory,
    project,
    fakeBin,
    packageDir,
    agentHooksSource: join(import.meta.dir, '../../packages/agent-hooks/src/index.ts'),
    installLog,
    buildPayload,
    runStub,
    startStub,
    readInstallLog,
  };
}

test('it installs the missing package in a fresh worktree, then blocks a gated edit with the gate reason', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
  });

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');

  expect(result.stderr).toBe(
    `stub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  );

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it allows an ungated edit after the install with no output', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
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

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
  });

  ctx.runStub(ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }));

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    `Load the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  );

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it refuses an edit with the install message when the install fails', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');

  expect(result.stderr).toBe(
    'stub install started\nTo work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n',
  );
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

  expect(result.stderr).toEndWith(
    'To work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n',
  );
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

  expect(result.stderr).toEndWith(
    'To work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n',
  );
});

test.each([
  { label: 'a cd before it', command: 'cd packages && bun install' },
  { label: 'a pipe after it', command: 'bun install 2>&1 | tail' },
  { label: 'a flag the stub does not list', command: 'bun install --verbose' },
])(
  'it names the bun install it allows when it refuses bun install with $label and the install fails',
  async (row) => {
    const ctx = await setupTest();

    await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

    const result = ctx.runStub(ctx.buildPayload('Bash', { command: row.command }));

    expect(result.status).toBe(2);

    expect(result.stderr).toEndWith(
      'To work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n',
    );
  },
);

test.each([
  'bun install',
  'bun install --frozen-lockfile',
  'ls -la src',
  'cat package.json',
  'pwd',
])('it allows the Bash command %s when the install fails', async (command) => {
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

  expect(result.stderr).toEndWith(
    'To work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n',
  );
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

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
  });

  const first = ctx.startStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  await readStreamUntil(first.stderr, 'stub install started');

  const second = ctx.startStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  const waiting = await readStreamUntil(second.stderr, 'Another agent hook runs bun install here');

  await writeFile(releasePath, '');

  const decided = await readStreamUntil(second.stderr, 'lists the skills each path needs.');
  const firstStatus = await first.exited;
  const secondStatus = await second.exited;

  expect(firstStatus).toBe(2);
  expect(secondStatus).toBe(2);

  expect(`${waiting}${decided}`).toBe(
    `Another agent hook runs bun install here, so this one waits for it.\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
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

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
  });

  const stopped = spawnSync('true');

  await mkdir(join(ctx.project, 'node_modules'));
  await writeFile(join(ctx.project, 'node_modules/.agent-hooks-install.lock'), String(stopped.pid));

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    `stub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  );
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

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
  });

  await mkdir(join(ctx.project, 'node_modules'));
  await writeFile(join(ctx.project, 'node_modules/.agent-hooks-install.lock'), row.contents);

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    `stub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  );
});

test('it waits while another hook holds the guard on the install lock, then installs over a stale lock', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
  });

  const stopped = spawnSync('true');

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock': String(stopped.pid),
    'node_modules/.agent-hooks-install.lock.guard': String(process.pid),
  });

  const hook = ctx.startStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  const waiting = await readStreamUntil(hook.stderr, 'waits its turn');
  const installLogWhileGuarded = await ctx.readInstallLog();

  await rm(join(ctx.project, 'node_modules/.agent-hooks-install.lock.guard'));

  const decided = await readStreamUntil(hook.stderr, 'lists the skills each path needs.');
  const status = await hook.exited;

  expect(installLogWhileGuarded).toBe('');
  expect(status).toBe(2);

  expect(`${waiting}${decided}`).toBe(
    `Another agent hook claims the install lock here, so this one waits its turn.\nstub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  );

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it skips the install and refuses when a stopped hook left the guard behind', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
  });

  const stopped = spawnSync('true');

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock.guard': String(stopped.pid),
  });

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    `A stopped agent hook left ${join(ctx.project, 'node_modules/.agent-hooks-install.lock.guard')} behind, so this one skips the install. Remove that file.\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  );

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe('');
});

test('it runs one install for two hook calls that meet a stale lock at once', async () => {
  const ctx = await setupTest();

  const releasePath = join(ctx.directory, 'release');

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
    releasePath,
  });

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': `export * from ${JSON.stringify(ctx.agentHooksSource)};\n`,
  });

  await writeTreeFiles(ctx.project, {
    '.claude/skill-gate.json': JSON.stringify({
      gates: [{ match: '**/*.md', skills: ['docs-writing'] }],
    }),
    '.claude/skills/docs-writing/SKILL.md': '# Docs writing\n',
    'transcript.jsonl': '',
  });

  const stopped = spawnSync('true');

  // A guard that this test holds stops both hooks before the stale lock, so its removal sends them
  // at the stale lock together.
  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock': String(stopped.pid),
    'node_modules/.agent-hooks-install.lock.guard': String(process.pid),
  });

  const first = ctx.startStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  const second = ctx.startStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  await readStreamUntil(first.stderr, 'waits its turn');
  await readStreamUntil(second.stderr, 'waits its turn');
  await rm(join(ctx.project, 'node_modules/.agent-hooks-install.lock.guard'));

  const waiting = await Promise.race([
    readStreamUntil(first.stderr, 'Another agent hook runs bun install here'),
    readStreamUntil(second.stderr, 'Another agent hook runs bun install here'),
  ]);

  await writeFile(releasePath, '');

  const firstStatus = await first.exited;
  const secondStatus = await second.exited;

  expect(firstStatus).toBe(2);
  expect(secondStatus).toBe(2);

  expect(waiting).toInclude(
    'Another agent hook runs bun install here, so this one waits for it.\n',
  );

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test.skipIf(isRoot)(
  'it skips the install and refuses when it cannot create the install lock',
  async () => {
    const ctx = await setupTest();

    await createStubInstall(ctx.fakeBin, {
      log: ctx.installLog,
      outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
    });

    await mkdir(join(ctx.project, 'node_modules'), { mode: 0o555 });

    const hook = ctx.startStub(
      ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
    );

    const status = await hook.exited;

    const stderr = await new Response(hook.stderr).text();

    expect(status).toBe(2);

    expect(stderr).toStartWith(
      `The agent hook could not run bun install: Error: EACCES: permission denied, open '${join(ctx.project, 'node_modules/.agent-hooks-install.lock.guard')}.`,
    );

    expect(stderr).toEndWith(
      '\nTo work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n',
    );

    const installLog = await ctx.readInstallLog();

    expect(installLog).toBe('');
  },
);

test.skipIf(isRoot)(
  'it skips the install and refuses when it cannot read the install lock',
  async () => {
    const ctx = await setupTest();

    await createStubInstall(ctx.fakeBin, {
      log: ctx.installLog,
      outcome: { kind: 'links', packageName: '@zgeoff/agent-hooks', packageDir: ctx.packageDir },
    });

    const stopped = spawnSync('true');

    await writeTreeFiles(ctx.project, {
      'node_modules/.agent-hooks-install.lock': String(stopped.pid),
    });

    await chmod(join(ctx.project, 'node_modules/.agent-hooks-install.lock'), 0o000);

    const hook = ctx.startStub(
      ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
    );

    const status = await hook.exited;

    const stderr = await new Response(hook.stderr).text();

    expect(status).toBe(2);

    expect(stderr).toBe(
      `The agent hook could not run bun install: Error: EACCES: permission denied, open '${join(ctx.project, 'node_modules/.agent-hooks-install.lock')}'\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
    );

    const installLog = await ctx.readInstallLog();

    expect(installLog).toBe('');
  },
);

test('it refuses a harness it does not know', async () => {
  const ctx = await setupTest();

  const result = ctx.runStub(
    ctx.buildPayload('Write', { file_path: join(ctx.project, 'guide.md') }),
    ['--harness', 'cursor'],
  );

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    'The agent hook does not know the harness cursor. Use codex or claude-code.\n',
  );
});

test.each([
  ['the guard is absent', { lock: 'guard', state: 'absent' }, 'retry-guard'],
  ['another hook holds the guard', { lock: 'guard', state: 'held' }, 'wait-for-guard'],
  ['a stopped hook left the guard', { lock: 'guard', state: 'stale' }, 'give-up'],
  ['the install lock is absent', { lock: 'install', state: 'absent' }, 'take-lock'],
  ['another hook holds the install lock', { lock: 'install', state: 'held' }, 'wait-for-install'],
  ['a stopped hook left the install lock', { lock: 'install', state: 'stale' }, 'take-lock'],
] as const)('it picks the claim step when %s', (_, claim, expected) => {
  expect(pickClaimStep(claim)).toBe(expected);
});
