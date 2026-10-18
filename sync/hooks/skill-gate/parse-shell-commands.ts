import type { ShellCommand, ShellRedirect, ShellWord } from './types.ts';

// Parses a Bash command line into its simple commands, or null on an unclosed quote. A word with a
// parameter, a substitution or an unquoted glob is not literal, so no caller reads it as a path. A
// here document's body becomes the command's stdin.
export function parseShellCommands(text: string): readonly ShellCommand[] | null {
  const tokens = splitShellTokens(text);

  return tokens === null ? null : buildShellCommands(tokens);
}

type ShellToken =
  | { readonly kind: 'word'; readonly word: ShellWord }
  | { readonly kind: 'separator' }
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
        const end = findHeredocEnd(text, index, heredoc);

        tokens.push({ kind: 'heredoc', body: text.slice(index, end.bodyEnd) });

        index = end.next;
      }

      tokens.push({ kind: 'separator' });
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

        const token: ShellToken = SEPARATORS.has(operator)
          ? { kind: 'separator' }
          : { kind: 'redirect', operator };

        tokens.push(token);
      }
    }
  }

  return tokens;
}

function findHeredocEnd(
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

const SEPARATORS = new Set(['&&', '||', '|&', ';;', '|', '&', ';', '(', ')']);

function findOperator(text: string, index: number): string | null {
  return OPERATORS.find((operator) => text.startsWith(operator, index)) ?? null;
}

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

// Finds where a `$name`, `${…}`, `$(…)` or backtick expansion that starts at `index` ends.
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

// Finds the end of the bracket group that opens at `index`, past nested groups and quoted text.
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

const GLOB_CHARS = '*?[{';

function isFileDescriptor(word: ShellWord): boolean {
  return word.literal && /^\d+$/u.test(word.text);
}

function isRedirectStart(char: string): boolean {
  return char === '<' || char === '>';
}

function buildShellCommands(tokens: readonly ShellToken[]): readonly ShellCommand[] {
  const commands: ShellCommand[] = [];
  let words: ShellWord[] = [];
  let redirects: ShellRedirect[] = [];
  let stdin: string | null = null;
  let operator: string | null = null;

  for (const token of tokens) {
    if (token.kind === 'separator') {
      if (words.length > 0 || redirects.length > 0) {
        commands.push({ words, redirects, stdin });
      }

      words = [];
      redirects = [];
      stdin = null;
      operator = null;
    } else if (token.kind === 'heredoc') {
      stdin = token.body;
    } else if (token.kind === 'redirect') {
      operator = token.operator;
    } else if (operator === null) {
      words.push(token.word);
    } else {
      redirects.push({ operator, target: token.word });

      operator = null;
    }
  }

  if (words.length > 0 || redirects.length > 0) {
    commands.push({ words, redirects, stdin });
  }

  return commands;
}
