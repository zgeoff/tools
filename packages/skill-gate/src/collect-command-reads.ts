import path from 'node:path';
import { parseShellCommands } from './parse-shell-commands.ts';
import type { ShellCommand, ShellWord } from './types.ts';

// The files that a shell command reads with a reader that shows the whole file or a slice of it,
// as absolute paths. `sed` counts only as `sed -n`, which prints a slice instead of rewriting.
export function collectCommandReads(command: string, cwd: string): readonly string[] {
  const commands = parseShellCommands(command, { withGuards: true }) ?? [];
  const reads: string[] = [];
  const parentDirs: (string | null)[] = [];
  let current: string | null = cwd;

  for (const entry of commands) {
    const enteredFrom = current;

    parentDirs.push(...Array.from({ length: entry.enters }, () => enteredFrom));

    if (current !== null && isSureToRun(entry)) {
      const directory = current;

      reads.push(...collectReaderPaths(entry).map((word) => path.resolve(directory, word)));
    }

    current = resolveNextDir(entry, current);

    // Leaving a subshell drops its `cd`, so the parent's directory comes back.
    for (let left = 0; left < entry.leaves && parentDirs.length > 0; left += 1) {
      current = parentDirs.pop() ?? null;
    }
  }

  return [...new Set(reads)];
}

// A command after `||`, or after an `&&` command that may fail, may never run, and a skill it
// reads is then not loaded. Only commands that cannot fail count as sure.
function isSureToRun(command: ShellCommand): boolean {
  const guard = command.guard ?? null;

  return guard === null || (!guard.viaOr && guard.before.every((words) => isSureToSucceed(words)));
}

const SURE_PROGRAMS = new Set(['cd', 'pushd', 'true', ':', 'export']);

const ASSIGNMENT = /^[A-Za-z_]\w*=/u;

function isSureToSucceed(words: readonly ShellWord[]): boolean {
  const firstWord = words.find((word) => !ASSIGNMENT.test(word.text));

  return firstWord !== undefined && firstWord.literal && SURE_PROGRAMS.has(firstWord.text);
}

const READERS = new Set(['cat', 'head', 'tail', 'sed', 'nl', 'less', 'bat']);

function collectReaderPaths(command: ShellCommand): readonly string[] {
  const firstWord = command.words.findIndex((word) => !ASSIGNMENT.test(word.text));
  const words = firstWord === -1 ? [] : command.words.slice(firstWord);
  const [program, ...args] = words;

  if (program === undefined || !program.literal) {
    return [];
  }

  const name = path.basename(program.text);

  if (!READERS.has(name)) {
    return [];
  }

  const quiet = args.some(
    (arg) =>
      /^-[A-Za-z]*n[A-Za-z]*$/u.test(arg.text) || arg.text === '--quiet' || arg.text === '--silent',
  );

  if (name === 'sed' && !quiet) {
    return [];
  }

  const operands = args
    .filter((arg) => arg.literal && arg.text !== '' && !arg.text.startsWith('-'))
    .map((arg) => arg.text);

  const redirected = command.redirects
    .filter((redirect) => redirect.operator === '<' && redirect.target.literal)
    .map((redirect) => redirect.target.text);

  return [...operands, ...redirected];
}

// A `cd` to a target the parser cannot read leaves the directory unknown, and the reads after it
// then count for nothing, which denies an edit rather than letting one through.
function resolveNextDir(command: ShellCommand, directory: string | null): string | null {
  const firstWord = command.words.findIndex((word) => !ASSIGNMENT.test(word.text));
  const [program, ...args] = firstWord === -1 ? [] : command.words.slice(firstWord);

  if (program?.text !== 'cd' || !program.literal) {
    return directory;
  }

  const target = args.find((arg) => !arg.text.startsWith('-'));

  if (target === undefined || !target.literal) {
    return null;
  }

  return directory === null && !path.isAbsolute(target.text)
    ? null
    : path.resolve(directory ?? '/', target.text);
}
