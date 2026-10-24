import { basename } from 'node:path';
import type { RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

export interface TestTimeoutsCheckOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runProgram: RunProgram;
}

export interface TestTimeoutFinding {
  // Relative to the repo root.
  readonly path: string;

  readonly message: string;
}

// The check reads the files as HEAD holds them, so a push checks what it sends.
export function runTestTimeoutsCheck(
  options: Readonly<TestTimeoutsCheckOptions>,
): TestTimeoutFinding[] {
  const paths = runGit(options, ['ls-tree', '-r', '-z', '--name-only', 'HEAD']).split('\0');

  const lanes = paths.includes(oxlintConfigPath)
    ? parseLanes(runGit(options, ['show', `HEAD:${oxlintConfigPath}`]))
    : [];

  return paths
    .filter((path) => checkedFiles.has(basename(path)))
    .flatMap((path) => {
      const text = runGit(options, ['show', `HEAD:${path}`]);

      return basename(path) === 'package.json'
        ? collectScriptFindings(path, text, lanes)
        : collectBunfigFindings(path, text);
    });
}

const oxlintConfigPath = '.oxlintrc.json';

const checkedFiles = new Set(['package.json', 'bunfig.toml']);

function runGit(options: Readonly<TestTimeoutsCheckOptions>, args: readonly string[]): string {
  const result = options.runProgram(['git', ...args], { cwd: options.cwd, env: options.env });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

function parseLanes(text: string): string[] {
  const config = parseText(oxlintConfigPath, text, (input) => Bun.JSONC.parse(input));
  const setting = findMember(findMember(config, 'rules'), 'zgeoff/max-test-timeout');
  const ruleOptions: unknown = Array.isArray(setting) ? setting[1] : undefined;
  const lanes = findMember(ruleOptions, 'lanes');

  return Array.isArray(lanes)
    ? lanes.filter((lane): lane is string => typeof lane === 'string')
    : [];
}

function parseText(path: string, text: string, parse: (input: string) => unknown): unknown {
  try {
    return parse(text);
  } catch (error) {
    throw new Error(
      `cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function findMember(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, key)
    ? Reflect.get(value, key)
    : undefined;
}

const limitMs = 5000;
const builtInLanes = ['e2e', 'browser', 'docker', 'host'];

function collectScriptFindings(
  path: string,
  text: string,
  lanes: readonly string[],
): TestTimeoutFinding[] {
  const scripts = findMember(
    parseText(path, text, (input) => JSON.parse(input)),
    'scripts',
  );

  if (typeof scripts !== 'object' || scripts === null) {
    return [];
  }

  const exempt = new Set([
    'test:related',
    ...[...builtInLanes, ...lanes].map((lane) => `test:${lane}`),
  ]);

  return Object.entries(scripts).flatMap(([name, command]: readonly [string, unknown]) => {
    if (typeof command !== 'string' || exempt.has(name)) {
      return [];
    }

    return collectTimeoutValues(command)
      .filter((timeoutMs) => timeoutMs > limitMs)
      .map((timeoutMs) => ({
        path,
        message: `script "${name}" passes --timeout=${timeoutMs} to bun test, above the 5 s limit; only test:related and a lane script (test:<lane>, for e2e, browser, docker, host and each lane in the max-test-timeout lanes option) may raise it`,
      }));
  });
}

const assignmentPattern = /^[A-Za-z_][A-Za-z0-9_]*=/u;

// A wrapper such as `bash with-home.sh bun test` runs the words after it, and these only print them.
const printCommands = new Set(['echo', 'printf']);

// `--timeout 20000` and `--timeout=20000` both reach `bun test`, and a quoted word, such as a name
// pattern, is a value rather than a flag. A shell runs a quoted command name as the bare one.
function collectTimeoutValues(command: string): number[] {
  const values: number[] = [];

  for (const words of parseShellCommands(command)) {
    const name = words.find((word) => word.isQuoted || !assignmentPattern.test(word.text));

    if (name !== undefined && printCommands.has(name.text)) {
      continue;
    }

    const start = words.findIndex(
      (word, index) => word.text === 'bun' && words[index + 1]?.text === 'test',
    );

    if (start === -1) {
      continue;
    }

    const args = words.slice(start + 2);

    for (const [index, word] of args.entries()) {
      if (isBareWord(word, '--timeout')) {
        values.push(toTimeoutMs(args[index + 1]?.text));
      } else if (!word.isQuoted && word.text.startsWith('--timeout=')) {
        values.push(toTimeoutMs(word.text.slice('--timeout='.length)));
      }
    }
  }

  return values;
}

interface ShellWord {
  readonly text: string;

  // Any part of the word sat inside quotes or behind a backslash.
  readonly isQuoted: boolean;
}

function parseShellCommands(command: string): ShellWord[][] {
  const commands: ShellWord[][] = [];
  let words: ShellWord[] = [];
  let text = '';
  let isQuoted = false;
  let hasWord = false;
  let quote: string | null = null;

  const endWord = () => {
    if (hasWord) {
      words.push({ text, isQuoted });
    }

    text = '';
    isQuoted = false;
    hasWord = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command.charAt(index);

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        text += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      isQuoted = true;
      hasWord = true;
    } else if (character === '\\') {
      index += 1;
      text += command.charAt(index);
      isQuoted = true;
      hasWord = true;
    } else if (/\s/u.test(character)) {
      endWord();
    } else if (character === ';' || character === '|' || character === '&') {
      endWord();

      commands.push(words);

      words = [];

      if (command.charAt(index + 1) === character) {
        index += 1;
      }
    } else {
      text += character;
      hasWord = true;
    }
  }

  endWord();

  commands.push(words);

  return commands;
}

function isBareWord(word: ShellWord | undefined, text: string): boolean {
  return word !== undefined && !word.isQuoted && word.text === text;
}

function toTimeoutMs(value: string | undefined): number {
  return Number(value?.replaceAll('_', ''));
}

function collectBunfigFindings(path: string, text: string): TestTimeoutFinding[] {
  const timeoutMs = findMember(
    findMember(
      parseText(path, text, (input) => Bun.TOML.parse(input)),
      'test',
    ),
    'timeout',
  );

  if (typeof timeoutMs !== 'number' || timeoutMs <= limitMs) {
    return [];
  }

  return [
    {
      path,
      message: `[test] timeout = ${timeoutMs} raises every test above the 5 s limit; keep the default and raise a timeout only in a lane`,
    },
  ];
}

function runCLI(): void {
  try {
    const findings = runTestTimeoutsCheck({ cwd: process.cwd(), env: process.env, runProgram });

    for (const finding of findings) {
      process.stdout.write(`${finding.path}: ${finding.message}\n`);
    }

    process.exitCode = findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `test-timeouts: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    process.exitCode = 2;
  }
}

if (import.meta.main) {
  runCLI();
}
