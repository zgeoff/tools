import { match } from 'ts-pattern';
import type { ShellCommand, ShellGuard, ShellRedirect, ShellWord } from './types.ts';

export function parseShellCommands(
  text: string,
  options: { readonly withGuards?: boolean } = {},
): readonly ShellCommand[] | null {
  const tokens = splitShellTokens(text);

  if (tokens === null) {
    return null;
  }

  const commands = buildShellCommands(tokens);

  return options.withGuards === true
    ? commands
    : commands.map((command) => ({
        words: command.words,
        redirects: command.redirects,
        stdin: command.stdin,
        enters: command.enters,
        leaves: command.leaves,
      }));
}

type ShellToken =
  | { readonly kind: 'word'; readonly word: ShellWord }
  | { readonly kind: 'separator'; readonly operator: string }
  | { readonly kind: 'subshell'; readonly opens: boolean }
  | { readonly kind: 'redirect'; readonly operator: string }
  | { readonly kind: 'heredoc'; readonly body: string };

interface PendingHeredoc {
  readonly delimiter: string;
  readonly stripTabs: boolean;
}

function splitShellTokens(text: string): ShellToken[] | null {
  const tokens: ShellToken[] = [];
  const heredocs: PendingHeredoc[] = [];
  let heredocOperator: string | null = null;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (char === ' ' || char === '\t') {
      index += 1;
    } else if (char === '\\' && text.charAt(index + 1) === '\n') {
      index += 2;
    } else if (char === '\n') {
      index += 1;

      for (const heredoc of heredocs.splice(0)) {
        const end = getHeredocEndOrTextEnd(text, index, heredoc);

        tokens.push({ kind: 'heredoc', body: text.slice(index, end.bodyEnd) });

        index = end.next;
      }

      tokens.push({ kind: 'separator', operator: '\n' });
    } else if (char === '#') {
      const lineEnd = text.indexOf('\n', index);

      index = lineEnd === -1 ? text.length : lineEnd;
    } else {
      const operator = findOperator(text, index);

      if (operator === null) {
        const parsed = parseShellWord(text, index);

        if (parsed === null) {
          return null;
        }

        index = parsed.end;

        if (heredocOperator !== null) {
          heredocs.push({ delimiter: parsed.word.text, stripTabs: heredocOperator === '<<-' });

          heredocOperator = null;
        }

        // A file descriptor number such as the 2 in `2>err.log` belongs to the redirect after it.
        if (!(isFileDescriptor(parsed.word) && isRedirectStart(text.charAt(index)))) {
          tokens.push({ kind: 'word', word: parsed.word });
        }
      } else {
        index += operator.length;
        heredocOperator = operator === '<<' || operator === '<<-' ? operator : null;

        tokens.push(buildOperatorToken(operator));
      }
    }
  }

  return tokens;
}

function getHeredocEndOrTextEnd(
  text: string,
  start: number,
  heredoc: PendingHeredoc,
): { readonly bodyEnd: number; readonly next: number } {
  let lineStart = start;

  while (lineStart < text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);

    if ((heredoc.stripTabs ? line.replace(/^\t+/u, '') : line) === heredoc.delimiter) {
      return { bodyEnd: lineStart, next: lineEnd };
    }

    lineStart = lineEnd + 1;
  }

  return { bodyEnd: text.length, next: text.length };
}

// Longest first, so `>>` wins over `>` and `&&` over `&`.
const OPERATORS = [
  '&>>',
  '<<-',
  '<<<',
  '>>',
  '>|',
  '&>',
  '>&',
  '<&',
  '<>',
  '<<',
  '&&',
  '||',
  '|&',
  ';;',
  '>',
  '<',
  '|',
  '&',
  ';',
  '(',
  ')',
];

function findOperator(text: string, index: number): string | null {
  return OPERATORS.find((operator) => text.startsWith(operator, index)) ?? null;
}

const GLOB_CHARS = '*?[{';

function parseShellWord(
  text: string,
  start: number,
): { readonly word: ShellWord; readonly end: number } | null {
  let value = '';
  let literal = true;
  let index = start;

  while (index < text.length && !isWordEnd(text.charAt(index))) {
    const char = text.charAt(index);

    if (char === '\\') {
      value += text.charAt(index + 1);
      index += 2;
    } else if (char === "'") {
      const close = text.indexOf("'", index + 1);

      if (close === -1) {
        return null;
      }

      value += text.slice(index + 1, close);
      index = close + 1;
    } else if (char === '"') {
      const quoted = parseDoubleQuoted(text, index + 1);

      if (quoted === null) {
        return null;
      }

      value += quoted.value;
      literal &&= quoted.literal;
      index = quoted.end;
    } else if (char === '$' || char === '`') {
      const end = findExpansionEnd(text, index);

      if (end === null) {
        return null;
      }

      literal = false;
      index = end;
    } else {
      if (GLOB_CHARS.includes(char) || (char === '~' && index === start)) {
        literal = false;
      }

      value += char;
      index += 1;
    }
  }

  return { word: { text: value, literal }, end: index };
}

function isWordEnd(char: string): boolean {
  return ' \t\n;&|<>()'.includes(char);
}

function parseDoubleQuoted(
  text: string,
  start: number,
): { readonly value: string; readonly literal: boolean; readonly end: number } | null {
  let value = '';
  let literal = true;
  let index = start;

  while (index < text.length) {
    const char = text.charAt(index);

    if (char === '"') {
      return { value, literal, end: index + 1 };
    }

    if (char === '\\' && '"\\$`\n'.includes(text.charAt(index + 1))) {
      value += text.charAt(index + 1);
      index += 2;
    } else if (char === '$' || char === '`') {
      const end = findExpansionEnd(text, index);

      if (end === null) {
        return null;
      }

      literal = false;
      index = end;
    } else {
      value += char;
      index += 1;
    }
  }

  return null;
}

function findExpansionEnd(text: string, index: number): number | null {
  if (text.charAt(index) === '`') {
    const close = text.indexOf('`', index + 1);

    return close === -1 ? null : close + 1;
  }

  const next = text.charAt(index + 1);

  if (next === '(' || next === '{') {
    return findGroupEnd(text, index + 1);
  }

  const name = /^(?:[A-Za-z_]\w*|[0-9?#@*$!-])/u.exec(text.slice(index + 1));

  return index + 1 + (name?.[0].length ?? 0);
}

function findGroupEnd(text: string, index: number): number | null {
  let depth = 0;
  let cursor = index;

  while (cursor < text.length) {
    const char = text.charAt(cursor);

    if (char === "'") {
      const close = text.indexOf("'", cursor + 1);

      if (close === -1) {
        return null;
      }

      cursor = close + 1;
    } else {
      depth += getDepthChange(char);
      cursor += char === '\\' ? 2 : 1;

      if (depth === 0) {
        return cursor;
      }
    }
  }

  return null;
}

function getDepthChange(char: string): number {
  if ('({'.includes(char)) {
    return 1;
  }

  return ')}'.includes(char) ? -1 : 0;
}

function isFileDescriptor(word: ShellWord): boolean {
  return word.literal && /^\d+$/u.test(word.text);
}

function isRedirectStart(char: string): boolean {
  return char === '<' || char === '>';
}

const SEPARATORS = new Set(['&&', '||', '|&', ';;', '|', '&', ';']);

function buildOperatorToken(operator: string): ShellToken {
  if (operator === '(' || operator === ')') {
    return { kind: 'subshell', opens: operator === '(' };
  }

  return SEPARATORS.has(operator)
    ? { kind: 'separator', operator }
    : { kind: 'redirect', operator };
}

interface GuardState {
  chain: ShellWord[][];
  viaOr: boolean;
}

interface CommandDraft {
  words: ShellWord[];
  redirects: ShellRedirect[];
  stdin: string | null;
  enters: number;
  leaves: number;
  guard: ShellGuard | null;
}

const LIST_ENDS = new Set(['&', ';', ';;', '\n']);

function buildShellCommands(tokens: readonly ShellToken[]): readonly ShellCommand[] {
  const commands: CommandDraft[] = [];
  const heredocOwners: CommandDraft[] = [];
  let draft = buildCommandDraft();
  let operator: string | null = null;
  let pipedIn = false;
  const listStarts = [0];
  let chain: ShellWord[][] = [];
  let viaOr = false;

  // The guard a group inherits from outside it, which a separator inside the group must not clear.
  let inherited: GuardState = { chain: [], viaOr: false };
  const outerStates: { chain: ShellWord[][]; viaOr: boolean; inherited: GuardState }[] = [];

  // A command on either side of a pipe runs in its own subshell, and so does the whole list before
  // `&`, such as `cd docs && make &`.
  const collectDraft = (separator: string | null): void => {
    const pipedOut = separator === '|' || separator === '|&';

    if (draft.words.length > 0 || draft.redirects.length > 0) {
      const piped = pipedIn || pipedOut;

      draft.enters += piped ? 1 : 0;
      draft.leaves += piped ? 1 : 0;
      draft.guard = chain.length > 0 || viaOr ? { viaOr, before: [...chain] } : null;

      if (separator === '&&' || separator === '||') {
        chain.push(draft.words);

        viaOr ||= separator === '||';
      }

      commands.push(draft);

      draft = buildCommandDraft();
    }

    if (separator !== null && LIST_ENDS.has(separator)) {
      chain = [...inherited.chain];
      viaOr = inherited.viaOr;
    }

    operator = null;
    pipedIn = pipedOut;

    const listStart = listStarts.at(-1) ?? 0;
    const first = commands[listStart];
    const last = commands.at(-1);

    if (separator === '&' && first !== undefined && last !== undefined) {
      first.enters += 1;
      last.leaves += 1;
    }

    if (separator !== null && LIST_ENDS.has(separator)) {
      listStarts[listStarts.length - 1] = commands.length;
    }
  };

  const collectToken = (token: ShellToken): void => {
    match(token)
      .with({ kind: 'separator' }, (separator) => {
        collectDraft(separator.operator);
      })
      .with({ kind: 'subshell' }, (subshell) => {
        collectDraft(null);

        const last = commands.at(-1);

        if (subshell.opens) {
          draft.enters += 1;

          listStarts.push(commands.length);
          outerStates.push({ chain, viaOr, inherited });

          inherited = { chain: [...chain], viaOr };
        } else {
          listStarts.pop();

          const outer = outerStates.pop();

          if (outer !== undefined) {
            ({ chain, viaOr, inherited } = outer);
          }

          if (last !== undefined) {
            last.leaves += 1;
          }
        }
      })
      .with({ kind: 'heredoc' }, (heredoc) => {
        // A here document's body belongs to the command whose `<<` asked for it, which a pipe may
        // already have closed.
        const owner = heredocOwners.shift();

        if (owner !== undefined) {
          owner.stdin = heredoc.body;
        }
      })
      .with({ kind: 'redirect' }, (redirect) => {
        operator = redirect.operator;

        if (operator === '<<' || operator === '<<-') {
          heredocOwners.push(draft);
        }
      })
      .with({ kind: 'word' }, (word) => {
        if (operator === null) {
          draft.words.push(word.word);
        } else {
          draft.redirects.push({ operator, target: word.word });

          operator = null;
        }
      })
      .exhaustive();
  };

  for (const token of tokens) {
    collectToken(token);
  }

  collectDraft(null);

  return commands;
}

function buildCommandDraft(): CommandDraft {
  return { words: [], redirects: [], stdin: null, enters: 0, leaves: 0, guard: null };
}
