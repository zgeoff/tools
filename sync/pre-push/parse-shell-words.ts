import { match } from 'ts-pattern';

export interface ShellWord {
  readonly text: string;
  readonly isQuoted: boolean;
  readonly isOperator: boolean;

  // An unquoted NAME= prefix makes the word a variable assignment, whatever quotes its value holds.
  readonly isAssignment: boolean;
}

type ShellContext =
  | 'plain'
  | 'single-quote'
  | 'double-quote'
  | 'substitution'
  | 'group'
  | 'backtick'
  | 'arithmetic'
  | 'arithmetic-group'
  | 'parameter';

interface ParserState {
  readonly command: string;
  readonly words: ShellWord[];
  readonly contexts: ShellContext[];
  index: number;
  text: string;
  isQuoted: boolean;
  redirect: string;

  // The word's text before its first quote, escape or expansion.
  plainText: string;
  isPlain: boolean;
}

// The parser keeps a stack of the quotes, substitutions and expansions it is inside, and each
// context reads the next character by the shell's rules for that context.
export function parseShellWords(command: string): ShellWord[] {
  const state: ParserState = {
    command,
    words: [],
    contexts: ['plain'],
    index: 0,
    text: '',
    isQuoted: false,
    redirect: '',
    plainText: '',
    isPlain: true,
  };

  while (state.index < command.length) {
    const context = state.contexts.at(-1) ?? 'plain';

    const action = pickAction(context, {
      character: command.charAt(state.index),
      ahead: command.slice(state.index + 1, state.index + 3),
      isWordStart: state.text === '' && !state.isQuoted,
      redirect: state.redirect,
    });

    advanceParser(state, action, context === 'plain');
  }

  endWord(state);

  return state.words;
}

interface ShellCursor {
  readonly character: string;
  readonly ahead: string;
  readonly isWordStart: boolean;

  // The unescaped `>` or `<` just before the character, or empty.
  readonly redirect: string;
}

type ShellAction =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'redirect'; readonly text: string }
  | { readonly kind: 'escape' }
  | { readonly kind: 'open'; readonly context: ShellContext; readonly text: string }
  | { readonly kind: 'close'; readonly text: string }
  | { readonly kind: 'break' }
  | { readonly kind: 'operator'; readonly text: string }
  | { readonly kind: 'comment' };

function pickAction(context: ShellContext, cursor: ShellCursor): ShellAction {
  return match(context)
    .with('plain', 'substitution', 'group', 'backtick', (current) =>
      pickCodeAction(current, cursor),
    )
    .with('single-quote', () => pickSingleQuotedAction(cursor))
    .with('double-quote', () => pickDoubleQuotedAction(cursor))
    .with('arithmetic', 'arithmetic-group', (current) => pickArithmeticAction(current, cursor))
    .with('parameter', () => pickParameterAction(cursor))
    .exhaustive();
}

function pickCodeAction(context: ShellContext, cursor: ShellCursor): ShellAction {
  const character = cursor.character;
  const opening = pickOpening(cursor);
  const isNested = context === 'substitution' || context === 'group';

  if (opening !== undefined) {
    return opening;
  }

  if (character === "'") {
    return { kind: 'open', context: 'single-quote', text: '' };
  }

  if (character === '"') {
    return { kind: 'open', context: 'double-quote', text: '' };
  }

  if (character === '`') {
    return context === 'backtick'
      ? { kind: 'close', text: '`' }
      : { kind: 'open', context: 'backtick', text: '`' };
  }

  if (character === '(' && isNested) {
    return { kind: 'open', context: 'group', text: '(' };
  }

  if (character === ')' && isNested) {
    return { kind: 'close', text: ')' };
  }

  if (character === '#' && cursor.isWordStart && context === 'plain') {
    return { kind: 'comment' };
  }

  if (character === '\n') {
    return { kind: 'operator', text: '\n' };
  }

  if (/\s/u.test(character)) {
    return { kind: 'break' };
  }

  return pickOperator(cursor) ?? pickPlainAction(character);
}

// `${` opens a parameter expansion, `$((` an arithmetic expansion and `$(` a command
// substitution, in code and in double quotes alike.
function pickOpening(cursor: ShellCursor): ShellAction | undefined {
  if (cursor.character === '\\') {
    return { kind: 'escape' };
  }

  if (cursor.character === '$' && cursor.ahead.startsWith('{')) {
    return { kind: 'open', context: 'parameter', text: '${' };
  }

  if (cursor.character === '$' && cursor.ahead === '((') {
    return { kind: 'open', context: 'arithmetic', text: '$((' };
  }

  if (cursor.character === '$' && cursor.ahead.startsWith('(')) {
    return { kind: 'open', context: 'substitution', text: '$(' };
  }

  return undefined;
}

// A redirection keeps its `|` and `&` in the word: `>|`, `>&`, `<&`, `&>` and `&>>`. `>>` and `<>`
// hold no operator character.
function pickOperator(cursor: ShellCursor): ShellAction | undefined {
  const character = cursor.character;
  const ahead = cursor.ahead;

  if (character === ';') {
    return { kind: 'operator', text: ';' };
  }

  if (character === '|' && cursor.redirect !== '>') {
    return { kind: 'operator', text: ahead.startsWith('|') ? '||' : '|' };
  }

  if (character === '&' && ahead.startsWith('&')) {
    return { kind: 'operator', text: '&&' };
  }

  if (character === '&' && cursor.redirect === '' && !ahead.startsWith('>')) {
    return { kind: 'operator', text: '&' };
  }

  return undefined;
}

function pickPlainAction(character: string): ShellAction {
  return character === '>' || character === '<'
    ? { kind: 'redirect', text: character }
    : { kind: 'text', text: character };
}

function pickSingleQuotedAction(cursor: ShellCursor): ShellAction {
  return cursor.character === "'"
    ? { kind: 'close', text: '' }
    : { kind: 'text', text: cursor.character };
}

function pickDoubleQuotedAction(cursor: ShellCursor): ShellAction {
  const opening = pickOpening(cursor);

  if (opening !== undefined) {
    return opening;
  }

  if (cursor.character === '`') {
    return { kind: 'open', context: 'backtick', text: '`' };
  }

  return cursor.character === '"'
    ? { kind: 'close', text: '' }
    : { kind: 'text', text: cursor.character };
}

function pickArithmeticAction(context: ShellContext, cursor: ShellCursor): ShellAction {
  const character = cursor.character;
  const opening = pickOpening(cursor);

  if (opening !== undefined) {
    return opening;
  }

  if (character === '(') {
    return { kind: 'open', context: 'arithmetic-group', text: '(' };
  }

  if (character === ')' && context === 'arithmetic-group') {
    return { kind: 'close', text: ')' };
  }

  if (character === ')' && cursor.ahead.startsWith(')')) {
    return { kind: 'close', text: '))' };
  }

  return { kind: 'text', text: character };
}

// A parameter expansion reads its default or pattern as text, so `${VALUE:-a;b}` holds no operator,
// while quotes and expansions inside it keep their meaning.
function pickParameterAction(cursor: ShellCursor): ShellAction {
  const opening = pickOpening(cursor);

  if (opening !== undefined) {
    return opening;
  }

  if (cursor.character === "'") {
    return { kind: 'open', context: 'single-quote', text: '' };
  }

  if (cursor.character === '"') {
    return { kind: 'open', context: 'double-quote', text: '' };
  }

  return cursor.character === '}'
    ? { kind: 'close', text: '}' }
    : { kind: 'text', text: cursor.character };
}

function advanceParser(state: ParserState, action: ShellAction, isTopLevel: boolean): void {
  state.redirect = action.kind === 'redirect' ? action.text : '';

  state.index += match(action)
    .with({ kind: 'text' }, { kind: 'redirect' }, (step) => {
      state.text += step.text;
      state.plainText += state.isPlain ? step.text : '';

      return 1;
    })
    .with({ kind: 'escape' }, () => {
      const escaped = state.command.charAt(state.index + 1);

      // A backslash before a newline joins the two lines into one.
      if (escaped !== '\n') {
        state.isPlain = false;
        state.text += escaped;
        state.isQuoted ||= isTopLevel;
      }

      return 2;
    })
    .with({ kind: 'open' }, (step) => {
      state.isPlain = false;

      state.contexts.push(step.context);

      state.text += step.text;
      state.isQuoted ||= isTopLevel && isQuoteContext(step.context);

      return Math.max(step.text.length, 1);
    })
    .with({ kind: 'close' }, (step) => {
      state.contexts.pop();

      state.text += step.text;

      return Math.max(step.text.length, 1);
    })
    .with({ kind: 'break' }, () => {
      endWord(state);

      return 1;
    })
    .with({ kind: 'operator' }, (step) => {
      endWord(state);

      state.words.push({ text: step.text, isQuoted: false, isOperator: true, isAssignment: false });

      return step.text.length;
    })
    .with({ kind: 'comment' }, () => state.command.length)
    .exhaustive();
}

function isQuoteContext(context: ShellContext): boolean {
  return context === 'single-quote' || context === 'double-quote';
}

const assignmentPattern = /^[A-Za-z_]\w*=/u;

function endWord(state: ParserState): void {
  if (state.text !== '' || state.isQuoted) {
    state.words.push({
      text: state.text,
      isQuoted: state.isQuoted,
      isOperator: false,
      isAssignment: assignmentPattern.test(state.plainText),
    });
  }

  state.text = '';
  state.isQuoted = false;
  state.plainText = '';
  state.isPlain = true;
}
