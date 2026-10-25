import type { ShellWord } from './parse-shell-words.ts';

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
  const operands = rest.filter((word) => !word.startsWith('-'));

  if (name === undefined) {
    return [];
  }

  if (shells.has(name)) {
    return [name, ...operands.slice(0, 1)];
  }

  return name === 'bun' && operands[0] === 'run' ? [name, ...operands.slice(1, 2)] : [name];
}
