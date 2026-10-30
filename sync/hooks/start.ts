import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { parseArgs } from 'node:util';

// A harness runs the call when a PreToolUse hook exits with any status but 2, so a static import
// that fails would let the call through. This file therefore imports only Node builtins.
const REFUSAL = 'To work here, run bun install.';
const AFTER_INSTALL = '--after-install';

const READ_ONLY_PROGRAMS = new Set(['cat', 'ls', 'pwd']);

const PLAIN_WORD = /^[\w./@:=+,-]+$/u;
const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const harness = parseHarness(args.filter((arg) => arg !== AFTER_INSTALL));

const agentHooks = await import('@zgeoff/agent-hooks').catch(() => null);

if (agentHooks !== null) {
  await agentHooks.runAgentHook({ harness });
}

if (!args.includes(AFTER_INSTALL)) {
  try {
    await runInstallOnce(path.join(root, 'node_modules', '.agent-hooks-install.lock'));
  } catch (error) {
    console.error(`The agent hook could not run bun install: ${String(error)}`);
  }

  // Bun can keep a failed package lookup for the life of the process, so the retry is a new process,
  // which reads the hook payload from the same stdin.
  const retry = spawnSync(
    process.execPath,
    ['--no-install', import.meta.filename, ...args, AFTER_INSTALL],
    {
      stdio: 'inherit',
    },
  );

  process.exit(retry.status ?? 2);
}

refuseUnlessReadOnly(readPayloadText());

function parseHarness(harnessArgs: readonly string[]): 'claude-code' | 'codex' {
  try {
    const value = parseArgs({ args: [...harnessArgs], options: { harness: { type: 'string' } } })
      .values.harness;

    if (value === undefined || value === 'claude-code' || value === 'codex') {
      return value ?? 'claude-code';
    }

    console.error(`The agent hook does not know the harness ${value}. Use codex or claude-code.`);
  } catch (error) {
    console.error(`The agent hook cannot read its arguments: ${String(error)}`);
  }

  return process.exit(2);
}

async function runInstallOnce(lockPath: string): Promise<void> {
  mkdirSync(path.dirname(lockPath), { recursive: true });

  if (!tryLock(lockPath)) {
    if (probeLockHeld(lockPath)) {
      console.error('Another agent hook runs bun install here, so this one waits for it.');

      while (probeLockHeld(lockPath)) {
        await setTimeout(100);
      }

      return;
    }

    rmSync(lockPath, { force: true });

    if (!tryLock(lockPath)) {
      return;
    }
  }

  try {
    spawnSync('bun', ['install', '--frozen-lockfile'], { cwd: root, stdio: ['ignore', 2, 2] });
  } finally {
    rmSync(lockPath, { force: true });
  }
}

function tryLock(lockPath: string): boolean {
  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });

    return true;
  } catch {
    return false;
  }
}

// A hook that the harness killed mid-install leaves its lock behind, so a lock counts only while
// the process that wrote it runs.
function probeLockHeld(lockPath: string): boolean {
  try {
    process.kill(Number(readFileSync(lockPath, 'utf8')), 0);

    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function readPayloadText(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// An agent can still run bun install by hand, and read the tree, while the package cannot load.
function refuseUnlessReadOnly(payloadText: string): never {
  const payload: unknown = parseJSON(payloadText);
  const event = readField(payload, 'hook_event_name');

  if (event !== undefined && event !== 'PreToolUse') {
    process.exit(0);
  }

  const command = readField(readField(payload, 'tool_input'), 'command');

  if (
    readField(payload, 'tool_name') === 'Bash' &&
    typeof command === 'string' &&
    isReadOnlyCommand(command)
  ) {
    process.exit(0);
  }

  console.error(REFUSAL);

  return process.exit(2);
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A shell can build a path from a variable, a glob or a substitution, so a command passes only as
// plain words. Git is left out: its config can make even a `git diff` with external diffs and
// textconv off run an fsmonitor program or a clean filter.
function isReadOnlyCommand(command: string): boolean {
  const [program, ...rest] = command.trim().split(/\s+/u);

  if (program === undefined || ![program, ...rest].every((word) => PLAIN_WORD.test(word))) {
    return false;
  }

  if (READ_ONLY_PROGRAMS.has(program)) {
    return true;
  }

  const [subcommand, ...options] = rest;

  return (
    program === 'bun' &&
    subcommand === 'install' &&
    options.every((option) => option === '--frozen-lockfile')
  );
}
