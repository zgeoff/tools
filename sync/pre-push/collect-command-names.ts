import type { ShellWord } from './parse-shell-words.ts';
import { parseShellWords } from './parse-shell-words.ts';

// Each command contributes the word the shell runs, after any NAME=value assignments, plus the
// script that `bash` or `sh` runs and the package script that `bun run` runs.
export function collectCommandNames(words: readonly ShellWord[]): string[] {
  return splitCommands(words).flatMap((command) => collectRunTargets(command));
}

function splitCommands(words: readonly ShellWord[]): ShellWord[][] {
  const commands: ShellWord[][] = [[]];

  for (const word of words) {
    if (word.isOperator) {
      commands.push([]);
    } else {
      commands.at(-1)?.push(word);
    }
  }

  return commands;
}

const shells = new Set(['bash', 'sh']);

function collectRunTargets(command: readonly ShellWord[]): string[] {
  const start = command.findIndex((word) => !word.isAssignment);
  const words = start === -1 ? [] : command.slice(start).map((word) => word.text);
  const [name, ...rest] = words;

  if (name === undefined) {
    return [];
  }

  if (shells.has(name)) {
    return [name, ...collectShellTargets(rest)];
  }

  const operands = rest.filter((word) => !word.startsWith('-'));

  return name === 'bun' && operands[0] === 'run' ? [name, ...operands.slice(1, 2)] : [name];
}

// With -s a shell reads its commands from standard input, so its first operand is an argument, and
// with -c that operand is a command string. -o takes the option name after it.
function collectShellTargets(args: readonly string[]): string[] {
  const optionEnd = args.findIndex(
    (argument, index) => !isShellOption(argument) && !isOptionName(args, index),
  );

  const options = optionEnd === -1 ? args : args.slice(0, optionEnd);
  const operand = optionEnd === -1 ? undefined : args[optionEnd];

  if (operand === undefined || options.some((option) => hasShortFlag(option, 's'))) {
    return [];
  }

  return options.some((option) => hasShortFlag(option, 'c'))
    ? collectCommandNames(parseShellWords(operand))
    : [operand];
}

function isShellOption(argument: string): boolean {
  return argument.startsWith('-') || argument.startsWith('+');
}

function isOptionName(args: readonly string[], index: number): boolean {
  const previous = args[index - 1];

  return previous === '-o' || previous === '+o';
}

function hasShortFlag(option: string, flag: string): boolean {
  return /^-[A-Za-z]+$/u.test(option) && option.includes(flag);
}
