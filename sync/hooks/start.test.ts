import { expect, mock, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepeatingAnswerQueue, waitFor } from '@zgeoff/testing/helpers';
import { buildPreToolUsePayload } from '../test-utils/build-pre-tool-use-payload.ts';
import { createStubInstall } from '../test-utils/create-stub-install.ts';
import { readRunFolderPrefix } from '../test-utils/read-run-folder-prefix.ts';
import { readStreamUntil } from '../test-utils/read-stream-until.ts';
import { readTextOrEmpty } from '../test-utils/read-text-or-empty.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';
import type { InstallDependencies } from './start.ts';
import {
  NODE_INSTALL_DEPENDENCIES,
  buildRetryArgs,
  claimInstallLock,
  findInstallFailure,
  parseHookArgs,
  parseLockPID,
  pickFallbackVerdict,
  pickInstallStep,
  pickLockState,
  pickRecoveryStep,
  pickRetryOutcome,
  readFallbackVerdict,
  readLockState,
  runInstallOnce,
  runRetryProcess,
} from './start.ts';

// The stub installs with the bun on PATH and runs the retry with its own runtime, so a stand-in bun
// first on PATH stands in for the install alone. Its installed package re-exports this repo's
// source, so the gate that runs after the install is the real one.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('agent-hooks-start-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const project = join(directory, 'project');
  const fakeBin = join(directory, 'bin');
  const packageDirectory = join(directory, 'package');
  const installLog = join(directory, 'install.log');
  const stubPath = join(project, '.claude/hooks/start.ts');

  await mkdir(join(project, '.claude/hooks'), { recursive: true });
  await mkdir(fakeBin);
  await mkdir(packageDirectory);
  await copyFile(join(import.meta.dir, 'start.ts'), stubPath);

  const env = {
    PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
    HOME: process.env['HOME'] ?? '',
    CLAUDE_PROJECT_DIR: project,
  };

  const runStubWithRuntime = (runtimePath: string, payload: string, args: readonly string[]) =>
    spawnSync(runtimePath, ['--no-install', stubPath, ...args], {
      encoding: 'utf8',
      env,
      input: payload,
    });

  const runStub = (payload: string, args: readonly string[]) =>
    runStubWithRuntime(process.execPath, payload, args);

  // The retry runs with the stub's own runtime, so a PATH of the empty stand-in folder leaves only
  // the install unable to start.
  const runStubWithoutBun = (payload: string) =>
    spawnSync(process.execPath, ['--no-install', stubPath], {
      encoding: 'utf8',
      env: { ...env, PATH: fakeBin },
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
    packageDirectory,
    agentHooksSource: join(import.meta.dir, '../../packages/agent-hooks/src/index.ts'),
    installLog,
    stubPath,
    runStub,
    runStubWithoutBun,
    runStubWithRuntime,
    startStub,
    readInstallLog,
  };
}

test('it installs the missing package in a fresh worktree, then blocks a gated edit with the gate reason', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
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
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  });

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test.each([{ argv: [] }, { argv: ['--'] }, { argv: ['--harness', 'codex', '--'] }])(
  'it allows an ungated edit after the install, with only the install output, when its arguments are $argv',
  async (row) => {
    const ctx = await setupTest();

    await createStubInstall(ctx.fakeBin, {
      log: ctx.installLog,
      outcome: {
        kind: 'links',
        packageName: '@zgeoff/agent-hooks',
        packageDirectory: ctx.packageDirectory,
      },
    });

    await writeTreeFiles(ctx.packageDirectory, {
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
      buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'main.ts') }),
      row.argv,
    );

    expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
      status: 0,
      stdout: '',
      stderr: 'stub install started\n',
    });
  },
);

test('it runs no install when the package loads', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
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

  ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `Load the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  });

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it refuses an edit with the install message when the install fails', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });
});

test('it prints why bun install could not start, then refuses an edit', async () => {
  const ctx = await setupTest();

  const result = ctx.runStubWithoutBun(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `The agent hook's bun install failed: Error: Executable not found in $PATH: "bun"\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });
});

test('it prints the signal that stopped bun install, then refuses an edit', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'killed' } });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install stopped on SIGKILL\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });
});

test('it refuses a gated edit with the import error and the install message when the installed package throws on import', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': "throw new Error('the gate table has no rows');\n",
  });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr:
      'stub install started\nThe agent hook could not load @zgeoff/agent-hooks: Error: the gate table has no rows\nTo work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n',
  });
});

test('it refuses a gated edit when the installed package has no hook to run', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': 'export const ledgerVersion = 3;\n',
  });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr:
      "stub install started\nThe agent hook failed: TypeError: step.agentHooks.runAgentHook is not a function. (In 'step.agentHooks.runAgentHook({ harness: args.harness })', 'step.agentHooks.runAgentHook' is undefined)\nTo work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag.\n",
  });
});

test('it lets a prompt through when the installed package has no hook to run', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': 'export const ledgerVersion = 3;\n',
  });

  const result = ctx.runStub(
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: ctx.project, prompt: 'Fix it' }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: '',
    stderr:
      "stub install started\nThe agent hook failed: TypeError: step.agentHooks.runAgentHook is not a function. (In 'step.agentHooks.runAgentHook({ harness: args.harness })', 'step.agentHooks.runAgentHook' is undefined)\n",
  });
});

test('it prints the import error and lets a PostToolUse event through when the installed package throws on import', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
    'package.json': JSON.stringify({
      name: '@zgeoff/agent-hooks',
      type: 'module',
      exports: './index.ts',
    }),
    'index.ts': "throw new Error('the gate table has no rows');\n",
  });

  const result = ctx.runStub(
    JSON.stringify({
      hook_event_name: 'PostToolUse',
      cwd: ctx.project,
      tool_name: 'Write',
      tool_input: { file_path: join(ctx.project, 'guide.md') },
    }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: '',
    stderr:
      'stub install started\nThe agent hook could not load @zgeoff/agent-hooks: Error: the gate table has no rows\n',
  });
});

// A parser cannot see a gated path that the shell builds, so only cat, ls, pwd and a bare bun
// install, as plain words, get through.
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
  'cd packages && bun install',
  'bun install 2>&1 | tail',
  'bun install --verbose',
  'bun',
  'date',
])('it refuses the Bash command %s when the install fails', async (command) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(buildPreToolUsePayload(ctx.project, 'Bash', { command }), []);

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });
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
  { label: 'no words', command: '' },
])('it refuses a Bash command with $label when the install fails', async (row) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Bash', { command: row.command }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });
});

test.each([
  'bun install',
  'bun install --frozen-lockfile',
  'ls -la src',
  'cat package.json',
  'pwd',
])('it allows the Bash command %s when the install fails', async (command) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(buildPreToolUsePayload(ctx.project, 'Bash', { command }), []);

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\n`,
  });
});

test('it refuses a gated tool call when the install fails', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'mcp__tracker__update_ticket', { title: 'Draft' }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });
});

test('it lets a prompt through when the install fails', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, { log: ctx.installLog, outcome: { kind: 'fails' } });

  const result = ctx.runStub(
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: ctx.project, prompt: 'Install it' }),
    ['--harness', 'codex'],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\n`,
  });
});

test('it runs one install for two parallel hook calls in one worktree', async () => {
  const ctx = await setupTest();

  const releasePath = join(ctx.directory, 'release');

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
    releasePath,
  });

  await writeTreeFiles(ctx.packageDirectory, {
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
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  const firstStart = await readStreamUntil(first.stderr, 'stub install started');

  const second = ctx.startStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  const waiting = await readStreamUntil(second.stderr, 'Another agent hook runs bun install here');

  await writeFile(releasePath, '');

  const decided = await readStreamUntil(second.stderr, 'lists the skills each path needs.');
  const firstStatus = await first.exited;
  const secondStatus = await second.exited;

  const firstStdout = await new Response(first.stdout).text();
  const secondStdout = await new Response(second.stdout).text();

  // No hook writes a NUL, so each read runs to the end of its stream.
  const firstRest = await readStreamUntil(first.stderr, '\u0000');
  const secondRest = await readStreamUntil(second.stderr, '\u0000');

  expect({
    status: firstStatus,
    stdout: firstStdout,
    stderr: `${firstStart}${firstRest}`,
  }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  });

  expect({
    status: secondStatus,
    stdout: secondStdout,
    stderr: `${waiting}${decided}${secondRest}`,
  }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `Another agent hook runs bun install here, so this one waits for it.\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  });

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it installs over a lock that a stopped hook left behind', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
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
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  });
});

test.each([
  { label: 'empty', contents: '' },
  { label: 'not a process id', contents: 'install' },
])('it installs over a lock whose contents are $label', async (row) => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
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
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  });
});

test('it waits while another hook holds the guard on the install lock, then installs over a stale lock', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await writeTreeFiles(ctx.packageDirectory, {
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
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
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
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  const stopped = spawnSync('true');

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock.guard': String(stopped.pid),
  });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `A stopped agent hook left ${join(ctx.project, 'node_modules/.agent-hooks-install.lock.guard')} behind, so this one skips the install. Remove that file.\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe('');
});

test('it runs one install for two hook calls that meet a stale lock at once', async () => {
  const ctx = await setupTest();

  const releasePath = join(ctx.directory, 'release');

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
    releasePath,
  });

  await writeTreeFiles(ctx.packageDirectory, {
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
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  const second = ctx.startStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
  );

  const firstTurn = await readStreamUntil(first.stderr, 'waits its turn');
  const secondTurn = await readStreamUntil(second.stderr, 'waits its turn');

  await rm(join(ctx.project, 'node_modules/.agent-hooks-install.lock.guard'));

  const firstRead = readStreamUntil(first.stderr, 'Another agent hook runs bun install here');
  const secondRead = readStreamUntil(second.stderr, 'Another agent hook runs bun install here');

  await Promise.race([firstRead, secondRead]);

  await writeFile(releasePath, '');

  const firstStatus = await first.exited;
  const secondStatus = await second.exited;

  const firstStdout = await new Response(first.stdout).text();
  const secondStdout = await new Response(second.stdout).text();

  // No hook writes a NUL, so each read runs to the end of its stream.
  const firstStderr = `${firstTurn}${await firstRead}${await readStreamUntil(first.stderr, '\u0000')}`;
  const secondStderr = `${secondTurn}${await secondRead}${await readStreamUntil(second.stderr, '\u0000')}`;

  expect([
    { status: firstStatus, stdout: firstStdout, stderr: firstStderr },
    { status: secondStatus, stdout: secondStdout, stderr: secondStderr },
  ]).toIncludeSameMembers([
    {
      status: 2,
      stdout: '',
      stderr: `Another agent hook claims the install lock here, so this one waits its turn.\nstub install started\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
    },
    {
      status: 2,
      stdout: '',
      stderr: `Another agent hook claims the install lock here, so this one waits its turn.\nAnother agent hook runs bun install here, so this one waits for it.\nLoad the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
    },
  ]);

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

// Root ignores file modes, so a folder or a lock with no permissions cannot stop root from using it.
test.skipIf(process.getuid?.() === 0)(
  'it skips the install and refuses when it cannot create the install lock',
  async () => {
    const ctx = await setupTest();

    await createStubInstall(ctx.fakeBin, {
      log: ctx.installLog,
      outcome: {
        kind: 'links',
        packageName: '@zgeoff/agent-hooks',
        packageDirectory: ctx.packageDirectory,
      },
    });

    await mkdir(join(ctx.project, 'node_modules'), { mode: 0o555 });

    const hook = ctx.startStub(
      buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    );

    const status = await hook.exited;

    const stderr = await new Response(hook.stderr).text();

    expect({ status, stderr }).toStrictEqual({
      status: 2,
      stderr: expect.stringMatching(
        /^The agent hook's bun install failed: Error: EACCES: permission denied, open '.+\/node_modules\/\.agent-hooks-install\.lock\.guard\.\d+'\nThe agent hook could not load @zgeoff\/agent-hooks: ResolveMessage: Cannot find package '@zgeoff\/agent-hooks' imported from .+\nTo work here, run exactly `bun install` or `bun install --frozen-lockfile` as its own Bash command, with no cd, pipe, redirect or other flag\.\n$/u,
      ),
    });

    const installLog = await ctx.readInstallLog();

    expect(installLog).toBe('');
  },
);

// Root ignores file modes, so a folder or a lock with no permissions cannot stop root from using it.
test.skipIf(process.getuid?.() === 0)(
  'it skips the install and refuses when it cannot read the install lock',
  async () => {
    const ctx = await setupTest();

    await createStubInstall(ctx.fakeBin, {
      log: ctx.installLog,
      outcome: {
        kind: 'links',
        packageName: '@zgeoff/agent-hooks',
        packageDirectory: ctx.packageDirectory,
      },
    });

    const stopped = spawnSync('true');

    await writeTreeFiles(ctx.project, {
      'node_modules/.agent-hooks-install.lock': String(stopped.pid),
    });

    await chmod(join(ctx.project, 'node_modules/.agent-hooks-install.lock'), 0o000);

    const hook = ctx.startStub(
      buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    );

    const status = await hook.exited;

    const stderr = await new Response(hook.stderr).text();

    expect({ status, stderr }).toStrictEqual({
      status: 2,
      stderr: `The agent hook's bun install failed: Error: EACCES: permission denied, open '${join(ctx.project, 'node_modules/.agent-hooks-install.lock')}'\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
    });

    const installLog = await ctx.readInstallLog();

    expect(installLog).toBe('');
  },
);

test('it skips the install and refuses when the install lock is a folder', async () => {
  const ctx = await setupTest();

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: {
      kind: 'links',
      packageName: '@zgeoff/agent-hooks',
      packageDirectory: ctx.packageDirectory,
    },
  });

  await mkdir(join(ctx.project, 'node_modules/.agent-hooks-install.lock'), { recursive: true });

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `The agent hook's bun install failed: Error: EISDIR: illegal operation on a directory, read\nThe agent hook could not load @zgeoff/agent-hooks: ResolveMessage: Cannot find package '@zgeoff/agent-hooks' imported from ${ctx.stubPath}\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });

  const installLog = await ctx.readInstallLog();

  expect(installLog).toBe('');
});

test('it refuses a harness it does not know', async () => {
  const ctx = await setupTest();

  const result = ctx.runStub(
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    ['--harness', 'cursor'],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: 'The agent hook does not know the harness cursor. Use codex or claude-code.\n',
  });
});

// The stub retries with its own runtime, so a stand-in install that removes a copy of that runtime
// makes the retry fail to start.
test('it prints the spawn error and refuses when its retry cannot start', async () => {
  const ctx = await setupTest();

  const runtimePath = join(ctx.directory, 'runtime/bun');

  await mkdir(join(ctx.directory, 'runtime'));
  await copyFile(process.execPath, runtimePath);
  await chmod(runtimePath, 0o755);

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'removes', path: runtimePath },
  });

  const result = ctx.runStubWithRuntime(
    runtimePath,
    buildPreToolUsePayload(ctx.project, 'Write', { file_path: join(ctx.project, 'guide.md') }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 2,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not start its retry: Error: ENOENT: no such file or directory, posix_spawn '${runtimePath}'\nTo work here, run exactly \`bun install\` or \`bun install --frozen-lockfile\` as its own Bash command, with no cd, pipe, redirect or other flag.\n`,
  });
});

test('it prints the spawn error and lets a prompt through when its retry cannot start', async () => {
  const ctx = await setupTest();

  const runtimePath = join(ctx.directory, 'runtime/bun');

  await mkdir(join(ctx.directory, 'runtime'));
  await copyFile(process.execPath, runtimePath);
  await chmod(runtimePath, 0o755);

  await createStubInstall(ctx.fakeBin, {
    log: ctx.installLog,
    outcome: { kind: 'removes', path: runtimePath },
  });

  const result = ctx.runStubWithRuntime(
    runtimePath,
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: ctx.project, prompt: 'Fix it' }),
    [],
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: '',
    stderr: `stub install started\nThe agent hook's bun install failed: bun install exited with status 1\nThe agent hook could not start its retry: Error: ENOENT: no such file or directory, posix_spawn '${runtimePath}'\n`,
  });
});

test.each([
  { argv: [], expected: { kind: 'args', harness: 'claude-code', afterInstall: false } },
  {
    argv: ['--harness', 'codex'],
    expected: { kind: 'args', harness: 'codex', afterInstall: false },
  },
  {
    argv: ['--after-install'],
    expected: { kind: 'args', harness: 'claude-code', afterInstall: true },
  },
  {
    argv: ['--harness', 'codex', '--after-install'],
    expected: { kind: 'args', harness: 'codex', afterInstall: true },
  },
  {
    argv: ['--after-install', '--harness=codex'],
    expected: { kind: 'args', harness: 'codex', afterInstall: true },
  },
  {
    argv: ['--harness', 'cursor', '--after-install'],
    expected: {
      kind: 'error',
      message: 'The agent hook does not know the harness cursor. Use codex or claude-code.',
    },
  },
  {
    argv: ['--after-install=yes'],
    expected: {
      kind: 'error',
      message:
        "The agent hook cannot read its arguments: TypeError [ERR_PARSE_ARGS_INVALID_OPTION_VALUE]: Option '--after-install' does not take an argument",
    },
  },
  {
    argv: ['--verbose'],
    expected: {
      kind: 'error',
      message:
        "The agent hook cannot read its arguments: TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '--verbose'",
    },
  },
])('#parseHookArgs reads $argv as $expected.kind', (row) => {
  expect(parseHookArgs(row.argv)).toStrictEqual(row.expected);
});

test.each([
  {
    label: 'runs the hook when the package loads on the first run',
    agentHooksImport: { kind: 'loaded', agentHooks: 'ledger-module' },
    afterInstall: false,
    expected: { kind: 'run-hook', agentHooks: 'ledger-module' },
  },
  {
    label: 'runs the hook when the package loads on the retry',
    agentHooksImport: { kind: 'loaded', agentHooks: 'ledger-module' },
    afterInstall: true,
    expected: { kind: 'run-hook', agentHooks: 'ledger-module' },
  },
  {
    label: 'installs and retries when the package fails to load on the first run',
    agentHooksImport: { kind: 'failed', error: 'no ledger' },
    afterInstall: false,
    expected: { kind: 'install-and-retry' },
  },
  {
    label: 'refuses with the import error when the package fails to load on the retry',
    agentHooksImport: { kind: 'failed', error: 'no ledger' },
    afterInstall: true,
    expected: { kind: 'refuse', error: 'no ledger' },
  },
] as const)('#pickRecoveryStep $label', (row) => {
  expect(pickRecoveryStep(row.agentHooksImport, row.afterInstall)).toStrictEqual(row.expected);
});

test.each([
  {
    label: 'the guard is absent',
    claim: { lock: 'guard', state: 'absent', timedOut: false },
    expected: 'retry-guard',
  },
  {
    label: 'another hook holds the guard',
    claim: { lock: 'guard', state: 'held', timedOut: false },
    expected: 'wait-for-guard',
  },
  {
    label: 'a stopped hook left the guard',
    claim: { lock: 'guard', state: 'stale', timedOut: false },
    expected: 'stop',
  },
  {
    label: 'the install lock is absent',
    claim: { lock: 'install', state: 'absent', timedOut: false },
    expected: 'install',
  },
  {
    label: 'another hook holds the install lock',
    claim: { lock: 'install', state: 'held', timedOut: false },
    expected: 'wait-for-install',
  },
  {
    label: 'a stopped hook left the install lock',
    claim: { lock: 'install', state: 'stale', timedOut: false },
    expected: 'install',
  },
  {
    label: 'the install it waited for ended',
    claim: { lock: 'waited', state: 'absent', timedOut: false },
    expected: 'skip-install',
  },
  {
    label: 'the install it waits for still runs',
    claim: { lock: 'waited', state: 'held', timedOut: false },
    expected: 'wait-for-install',
  },
  {
    label: 'the hook it waited for stopped before its install ended',
    claim: { lock: 'waited', state: 'stale', timedOut: false },
    expected: 'claim-again',
  },
  {
    label: 'the guard is absent past the deadline',
    claim: { lock: 'guard', state: 'absent', timedOut: true },
    expected: 'out-of-time',
  },
  {
    label: 'another hook holds the guard past the deadline',
    claim: { lock: 'guard', state: 'held', timedOut: true },
    expected: 'out-of-time',
  },
  {
    label: 'a stopped hook left the guard past the deadline',
    claim: { lock: 'guard', state: 'stale', timedOut: true },
    expected: 'stop',
  },
  {
    label: 'the install lock is absent past the deadline',
    claim: { lock: 'install', state: 'absent', timedOut: true },
    expected: 'out-of-time',
  },
  {
    label: 'another hook holds the install lock past the deadline',
    claim: { lock: 'install', state: 'held', timedOut: true },
    expected: 'out-of-time',
  },
  {
    label: 'a stopped hook left the install lock past the deadline',
    claim: { lock: 'install', state: 'stale', timedOut: true },
    expected: 'out-of-time',
  },
  {
    label: 'the install it waited for ended past the deadline',
    claim: { lock: 'waited', state: 'absent', timedOut: true },
    expected: 'skip-install',
  },
  {
    label: 'the install it waits for still runs past the deadline',
    claim: { lock: 'waited', state: 'held', timedOut: true },
    expected: 'out-of-time',
  },
  {
    label: 'the hook it waited for stopped past the deadline',
    claim: { lock: 'waited', state: 'stale', timedOut: true },
    expected: 'claim-again',
  },
] as const)('#pickInstallStep picks $expected when $label', (row) => {
  expect(pickInstallStep(row.claim)).toBe(row.expected);
});

test.each([
  {
    label: 'the install could not start',
    result: { error: new Error('spawnSync bun ENOENT'), status: null, signal: null },
    expected: 'Error: spawnSync bun ENOENT',
  },
  {
    label: 'a signal stopped the install',
    result: { status: null, signal: 'SIGTERM' },
    expected: 'bun install stopped on SIGTERM',
  },
  {
    label: 'the install exited with a failure',
    result: { status: 1, signal: null },
    expected: 'bun install exited with status 1',
  },
  { label: 'the install passed', result: { status: 0, signal: null }, expected: null },
] as const)('#findInstallFailure reports $expected when $label', (row) => {
  expect(findInstallFailure(row.result)).toBe(row.expected);
});

test('#readLockState reads an absent lock without a process check', async () => {
  const ctx = await setupTest();

  const signalProcess = mock<InstallDependencies['signalProcess']>();

  const state = readLockState(join(ctx.directory, 'install.lock'), {
    ...NODE_INSTALL_DEPENDENCIES,
    signalProcess,
  });

  expect({ state, signals: signalProcess.mock.calls }).toStrictEqual({
    state: 'absent',
    signals: [],
  });
});

test('#readLockState reads a lock whose process runs as held', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'install.lock'), String(process.pid));

  const state = readLockState(join(ctx.directory, 'install.lock'), NODE_INSTALL_DEPENDENCIES);

  expect(state).toBe('held');
});

test('#readLockState reads a lock whose process has stopped as stale', async () => {
  const ctx = await setupTest();

  const stopped = spawnSync('true');

  await writeFile(join(ctx.directory, 'install.lock'), String(stopped.pid));

  const state = readLockState(join(ctx.directory, 'install.lock'), NODE_INSTALL_DEPENDENCIES);

  expect(state).toBe('stale');
});

test.each([
  { label: 'no lock', text: null, expected: 'absent' },
  { label: 'an empty lock', text: '', expected: 'malformed' },
  { label: 'a lock that holds a word', text: 'install', expected: 'malformed' },
  { label: 'a lock that holds 0', text: '0', expected: 'malformed' },
  { label: 'a lock that holds a negative number', text: '-3', expected: 'malformed' },
  { label: 'a lock that holds a fraction', text: '42.5', expected: 'malformed' },
  { label: 'a lock that holds a process id', text: '4242', expected: 4242 },
] as const)('#parseLockPID reads $label as $expected', (row) => {
  expect(parseLockPID(row.text)).toBe(row.expected);
});

test.each([
  { label: 'no lock', pid: 'absent', signalError: null, expected: 'absent' },
  { label: 'a malformed lock', pid: 'malformed', signalError: null, expected: 'stale' },
  { label: 'a lock whose process runs', pid: 4242, signalError: null, expected: 'held' },
  {
    label: 'a lock whose process runs as another user',
    pid: 4242,
    signalError: 'EPERM',
    expected: 'held',
  },
  { label: 'a lock whose process has stopped', pid: 4242, signalError: 'ESRCH', expected: 'stale' },
] as const)('#pickLockState picks $expected for $label', (row) => {
  expect(pickLockState(row.pid, row.signalError)).toBe(row.expected);
});

test('#claimInstallLock stops without a wait when a stopped hook left the guard', async () => {
  const ctx = await setupTest();

  const stopped = spawnSync('true');

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock.guard': String(stopped.pid),
  });

  const sleep = mock(() => Promise.resolve());

  const step = await claimInstallLock(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    Number.POSITIVE_INFINITY,
    { ...NODE_INSTALL_DEPENDENCIES, sleep },
  );

  const files = await readdir(join(ctx.project, 'node_modules'));

  expect({ step, sleeps: sleep.mock.calls, files }).toStrictEqual({
    step: 'stop',
    sleeps: [],
    files: ['.agent-hooks-install.lock.guard'],
  });
});

test('#claimInstallLock waits for the install and drops the guard when another hook holds the lock', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock': String(process.pid),
  });

  const step = await claimInstallLock(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    Number.POSITIVE_INFINITY,
    NODE_INSTALL_DEPENDENCIES,
  );

  const files = await readdir(join(ctx.project, 'node_modules'));

  const lockText = await readTextOrEmpty(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
  );

  expect({ step, files, lockText }).toStrictEqual({
    step: 'wait-for-install',
    files: ['.agent-hooks-install.lock'],
    lockText: String(process.pid),
  });
});

test('#claimInstallLock takes a lock that a stopped hook left, and drops the guard', async () => {
  const ctx = await setupTest();

  const stopped = spawnSync('true');

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock': String(stopped.pid),
  });

  const step = await claimInstallLock(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    Number.POSITIVE_INFINITY,
    NODE_INSTALL_DEPENDENCIES,
  );

  const files = await readdir(join(ctx.project, 'node_modules'));

  const lockText = await readTextOrEmpty(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
  );

  expect({ step, files, lockText }).toStrictEqual({
    step: 'install',
    files: ['.agent-hooks-install.lock'],
    lockText: String(process.pid),
  });
});

test('#claimInstallLock gives up when another hook holds the guard past the deadline', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock.guard': String(process.pid),
  });

  const sleep = mock(() => Promise.resolve());

  const step = await claimInstallLock(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    5000,
    { ...NODE_INSTALL_DEPENDENCIES, now: () => 5000, sleep },
  );

  const files = await readdir(join(ctx.project, 'node_modules'));

  expect({ step, sleeps: sleep.mock.calls, files }).toStrictEqual({
    step: 'out-of-time',
    sleeps: [],
    files: ['.agent-hooks-install.lock.guard'],
  });
});

test('#runInstallOnce installs when the hook it waits for stops before its install ends', async () => {
  const ctx = await setupTest();

  const holder = Bun.spawn(['sleep', '30'], { detached: true });

  onTestFinished(() => {
    Bun.spawnSync(['kill', '-KILL', '--', `-${holder.pid}`]);
  });

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock': String(holder.pid),
  });

  const sleep = mock(NODE_INSTALL_DEPENDENCIES.sleep);
  const runInstall = mock(() => ({ status: 0, signal: null }));

  const installing = runInstallOnce(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    Number.POSITIVE_INFINITY,
    { ...NODE_INSTALL_DEPENDENCIES, sleep, runInstall },
  );

  await waitFor(() => {
    expect(sleep).toHaveBeenCalled();
  });

  holder.kill('SIGKILL');

  await holder.exited;

  const failure = await installing;
  const files = await readdir(join(ctx.project, 'node_modules'));

  expect({ failure, installs: runInstall.mock.calls.length, files }).toStrictEqual({
    failure: null,
    installs: 1,
    files: [],
  });
});

test('#runInstallOnce reports a failure and runs no install when another hook holds the guard past the deadline', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock.guard': String(process.pid),
  });

  const runInstall = mock<InstallDependencies['runInstall']>(() => ({ status: 0, signal: null }));

  const failure = await runInstallOnce(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    5000,
    { ...NODE_INSTALL_DEPENDENCIES, now: () => 5000, runInstall },
  );

  expect({ failure, installs: runInstall.mock.calls }).toStrictEqual({
    failure: `the deadline passed before this agent hook could claim ${join(ctx.project, 'node_modules/.agent-hooks-install.lock')}`,
    installs: [],
  });
});

test('#runInstallOnce runs no install when it claims a free lock past the deadline', async () => {
  const ctx = await setupTest();

  const runInstall = mock<InstallDependencies['runInstall']>(() => ({ status: 0, signal: null }));

  const failure = await runInstallOnce(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    5000,
    { ...NODE_INSTALL_DEPENDENCIES, now: () => 5000, runInstall },
  );

  const files = await readdir(join(ctx.project, 'node_modules'));

  expect({ failure, installs: runInstall.mock.calls, files }).toStrictEqual({
    failure: `the deadline passed before this agent hook could claim ${join(ctx.project, 'node_modules/.agent-hooks-install.lock')}`,
    installs: [],
    files: [],
  });
});

test('#runInstallOnce reports a failure when the deadline passes while another hook holds the install lock', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.project, {
    'node_modules/.agent-hooks-install.lock': String(process.pid),
  });

  const runInstall = mock(() => ({ status: 0, signal: null }));

  const failure = await runInstallOnce(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    5000,
    { ...NODE_INSTALL_DEPENDENCIES, now: makeRepeatingAnswerQueue([0, 5000]), runInstall },
  );

  expect({ failure, installs: runInstall.mock.calls }).toStrictEqual({
    failure: `another agent hook held ${join(ctx.project, 'node_modules/.agent-hooks-install.lock')} past the deadline`,
    installs: [],
  });
});

test('#runInstallOnce gives the install the time left before the deadline', async () => {
  const ctx = await setupTest();

  const runInstall = mock<InstallDependencies['runInstall']>(() => ({ status: 0, signal: null }));

  const failure = await runInstallOnce(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    31_000,
    { ...NODE_INSTALL_DEPENDENCIES, now: () => 1000, runInstall },
  );

  expect({ failure, installs: runInstall.mock.calls }).toStrictEqual({
    failure: null,
    installs: [[30_000]],
  });
});

// A spawnSync timeout of 0 sets no limit, so an install that starts at the deadline still needs one.
test('#runInstallOnce gives the install 1 ms when the deadline passes after the claim', async () => {
  const ctx = await setupTest();

  const runInstall = mock<InstallDependencies['runInstall']>(() => ({ status: 0, signal: null }));

  const failure = await runInstallOnce(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    5000,
    { ...NODE_INSTALL_DEPENDENCIES, now: makeRepeatingAnswerQueue([0, 5000]), runInstall },
  );

  expect({ failure, installs: runInstall.mock.calls }).toStrictEqual({
    failure: null,
    installs: [[1]],
  });
});

test('#runInstallOnce reports the failure of its own install and drops the lock', async () => {
  const ctx = await setupTest();

  const failure = await runInstallOnce(
    join(ctx.project, 'node_modules/.agent-hooks-install.lock'),
    Number.POSITIVE_INFINITY,
    {
      ...NODE_INSTALL_DEPENDENCIES,
      runInstall: mock(() => ({ status: null, signal: 'SIGKILL' as const })),
    },
  );

  const files = await readdir(join(ctx.project, 'node_modules'));

  expect({ failure, files }).toStrictEqual({
    failure: 'bun install stopped on SIGKILL',
    files: [],
  });
});

test.each([
  {
    label: 'allows a PostToolUse event',
    payload: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write' }),
    expected: 'allow',
  },
  {
    label: 'allows a read-only Bash command',
    payload: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls src' },
    }),
    expected: 'allow',
  },
  {
    label: 'allows a read-only Bash command with no event name',
    payload: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pwd' } }),
    expected: 'allow',
  },
  {
    label: 'refuses a Bash command that writes',
    payload: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'touch ledger.md' },
    }),
    expected: 'refuse',
  },
  {
    label: 'refuses a Bash call with no command',
    payload: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: [] }),
    expected: 'refuse',
  },
  {
    label: 'refuses an edit',
    payload: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'ledger.md' },
    }),
    expected: 'refuse',
  },
  { label: 'refuses a payload that is not JSON', payload: 'ledger', expected: 'refuse' },
  { label: 'refuses an empty payload', payload: '', expected: 'refuse' },
] as const)('#pickFallbackVerdict $label', (row) => {
  expect(pickFallbackVerdict(row.payload)).toBe(row.expected);
});

test.each([
  {
    label: 'no arguments',
    argv: [],
    expected: ['--no-install', '/work/.claude/hooks/start.ts', '--after-install'],
  },
  {
    label: 'a harness',
    argv: ['--harness', 'codex'],
    expected: [
      '--no-install',
      '/work/.claude/hooks/start.ts',
      '--after-install',
      '--harness',
      'codex',
    ],
  },
  {
    label: 'an end of options',
    argv: ['--harness', 'codex', '--'],
    expected: [
      '--no-install',
      '/work/.claude/hooks/start.ts',
      '--after-install',
      '--harness',
      'codex',
      '--',
    ],
  },
] as const)('#buildRetryArgs puts the retry flag before $label', (row) => {
  expect(buildRetryArgs('/work/.claude/hooks/start.ts', row.argv)).toStrictEqual(row.expected);
});

test.each([
  {
    label: 'the retry passed',
    retry: { status: 0, signal: null },
    expected: { kind: 'exit', status: 0 },
  },
  {
    label: 'the retry refused',
    retry: { status: 2, signal: null },
    expected: { kind: 'exit', status: 2 },
  },
  {
    label: 'a signal stopped the retry',
    retry: { status: null, signal: 'SIGTERM' },
    expected: { kind: 'stopped', signal: 'SIGTERM' },
  },
] as const)('#pickRetryOutcome picks $expected.kind when $label', (row) => {
  expect(pickRetryOutcome(row.retry)).toStrictEqual(row.expected);
});

test('#pickRetryOutcome picks the fallback with the spawn error when the retry could not start', () => {
  const error = new Error('spawnSync bun ENOENT');

  expect(pickRetryOutcome({ error, status: null, signal: null })).toStrictEqual({
    kind: 'fallback',
    error,
  });
});

test('#runRetryProcess runs the retry with the retry flag and returns its exit', () => {
  const runRetry = mock<InstallDependencies['runRetry']>(() => ({ status: 0, signal: null }));

  const outcome = runRetryProcess('/work/.claude/hooks/start.ts', ['--harness', 'codex'], {
    ...NODE_INSTALL_DEPENDENCIES,
    runRetry,
  });

  expect({ outcome, retries: runRetry.mock.calls }).toStrictEqual({
    outcome: { kind: 'exit', status: 0 },
    retries: [
      [['--no-install', '/work/.claude/hooks/start.ts', '--after-install', '--harness', 'codex']],
    ],
  });
});

test.each([
  {
    label: 'a prompt',
    payload: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'Fix it' }),
    expected: 'allow',
  },
  {
    label: 'an edit',
    payload: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'ledger.md' },
    }),
    expected: 'refuse',
  },
] as const)('#readFallbackVerdict reads $label from the payload and picks $expected', (row) => {
  const verdict = readFallbackVerdict({
    ...NODE_INSTALL_DEPENDENCIES,
    readPayload: () => row.payload,
  });

  expect(verdict).toBe(row.expected);
});
