// The program that each stand-in runs. createStubBin copies this file's text behind a shebang, so
// it imports only from Bun and Node, and finds its config and state beside itself.
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { basename, dirname, join } from 'node:path';

interface RuntimeAnswer {
  readonly args: readonly string[];
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

interface RuntimeConfig {
  readonly answers: readonly RuntimeAnswer[] | null;
  readonly hasScript: boolean;
  readonly recordEnv: readonly string[];
  readonly recordStdin: boolean;
}

const unmatchedExitCode = 97;
const staleLockMs = 10_000;
const scriptPath = process.argv[1] ?? '';
const directory = dirname(scriptPath);
const name = basename(scriptPath);
const argv = process.argv.slice(2);
const config = readConfig();
const forwardedSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const pendingSignals: NodeJS.Signals[] = [];
let scriptProcess: { readonly kill: (signal: NodeJS.Signals) => void } | null = null;

// A script stand-in passes these signals on to the script. One that arrives before the script
// starts waits and goes out right after the spawn.
if (config.hasScript) {
  forwardedSignals.forEach((signal) => {
    forwardSignal(signal);
  });
}

const stdin = config.recordStdin ? await readStdin() : null;

recordCall(stdin);

if (config.hasScript) {
  process.exitCode = await runScript();
} else if (config.answers !== null) {
  await answerCall(config.answers);
}

function forwardSignal(signal: NodeJS.Signals): void {
  process.on(signal, () => {
    if (scriptProcess === null) {
      pendingSignals.push(signal);
    } else {
      scriptProcess.kill(signal);
    }
  });
}

function recordCall(input: Buffer | null): void {
  const env = Object.fromEntries(
    config.recordEnv.flatMap((variable) => {
      const value = process.env[variable];

      return value === undefined ? [] : [[variable, value]];
    }),
  );

  const call = { name, argv, cwd: process.cwd(), env, stdin: input?.toString() ?? '' };

  appendFileSync(join(directory, 'calls.jsonl'), `${JSON.stringify(call)}\n`);
}

function readConfig(): RuntimeConfig {
  const parsed: unknown = JSON.parse(readFileSync(join(directory, `.${name}.config.json`), 'utf8'));

  if (!isRuntimeConfig(parsed)) {
    throw new Error(`the config of the ${name} stand-in is malformed`);
  }

  return parsed;
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  return (
    typeof value === 'object' && value !== null && 'hasScript' in value && 'recordEnv' in value
  );
}

async function readStdin(): Promise<Buffer> {
  if (process.stdin.isTTY) {
    return Buffer.alloc(0);
  }

  try {
    const bytes = await Bun.stdin.arrayBuffer();

    return Buffer.from(bytes);
  } catch {
    return Buffer.alloc(0);
  }
}

async function runScript(): Promise<number> {
  const child = Bun.spawn([join(directory, `.${name}.script`), ...argv], {
    stdin: stdin ?? 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  scriptProcess = child;

  for (const signal of pendingSignals) {
    child.kill(signal);
  }

  const exitCode = await child.exited;

  const signalNumber =
    typeof child.signalCode === 'string' ? constants.signals[child.signalCode] : undefined;

  return signalNumber === undefined ? exitCode : 128 + signalNumber;
}

async function answerCall(answers: readonly RuntimeAnswer[]): Promise<void> {
  const answer = await withLock(() => takeAnswer(answers));

  if (answer === null) {
    process.stderr.write(`unexpected: ${name} ${argv.join(' ')}\n`);

    process.exitCode = unmatchedExitCode;

    return;
  }

  process.stdout.write(answer.stdout ?? '');
  process.stderr.write(answer.stderr ?? '');

  process.exitCode = answer.exitCode ?? 0;
}

// The first answer that matches and has not answered yet. When every match has answered, the last
// match answers again. Which answers have answered lives in the state file.
function takeAnswer(answers: readonly RuntimeAnswer[]): RuntimeAnswer | null {
  const statePath = join(directory, `.${name}.state.json`);
  const saved: unknown = JSON.parse(readFileSync(statePath, 'utf8'));
  const answered = answers.map((_, index) => Array.isArray(saved) && saved[index] === true);

  const matches = answers.flatMap((answer, index) =>
    answer.args.every((arg, position) => argv[position] === arg) ? [index] : [],
  );

  const chosen = matches.find((index) => answered[index] !== true) ?? matches.at(-1);

  if (chosen === undefined) {
    return null;
  }

  answered[chosen] = true;

  writeFileSync(statePath, JSON.stringify(answered));

  return answers[chosen] ?? null;
}

// Runs hold while this call holds the lock, a folder that only one call can make. A lock
// that is older than staleLockMs belongs to a call that died, and the next call removes it.
async function withLock<Result>(hold: () => Result): Promise<Result> {
  const lockPath = join(directory, `.${name}.lock`);

  for (;;) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }

      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleLockMs) {
          rmSync(lockPath, { recursive: true, force: true });
        }
      } catch {
        // The holder released the lock between the two calls.
      }

      await Bun.sleep(2);
    }
  }

  try {
    return hold();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}
