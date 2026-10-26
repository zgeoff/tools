export interface ShellWord {
  readonly text: string;
  readonly isQuoted: boolean;
  readonly isOperator: boolean;

  // An unquoted NAME= prefix makes the word a variable assignment, whatever quotes its value holds.
  readonly isAssignment: boolean;
}

export type ShellContext =
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

interface ShellCursor {
  readonly character: string;
  readonly ahead: string;
  readonly isWordStart: boolean;

  // The unescaped `>` or `<` just before the character, or empty.
  readonly redirect: string;
}

interface ShellActionFields {
  readonly text: { readonly text: string };
  readonly redirect: { readonly text: string };
  readonly escape: object;
  readonly open: { readonly context: ShellContext; readonly text: string };
  readonly close: { readonly text: string };
  readonly break: object;
  readonly operator: { readonly text: string };
  readonly comment: object;
}

type ShellActionOf<Kind extends keyof ShellActionFields> = {
  readonly kind: Kind;
} & ShellActionFields[Kind];

type ShellAction = {
  [Kind in keyof ShellActionFields]: ShellActionOf<Kind>;
}[keyof ShellActionFields];

// A table typed over every context, so a context without a reader fails the type check.
export type ShellContextReaders = Readonly<
  Record<ShellContext, (cursor: ShellCursor, context: ShellContext) => ShellAction>
>;

const contextReaders: ShellContextReaders = {
  plain: pickCodeAction,
  substitution: pickCodeAction,
  group: pickCodeAction,
  backtick: pickCodeAction,
  'single-quote': pickSingleQuotedAction,
  'double-quote': pickDoubleQuotedAction,
  arithmetic: pickArithmeticAction,
  'arithmetic-group': pickArithmeticAction,
  parameter: pickParameterAction,
};

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

    const action = contextReaders[context](
      {
        character: command.charAt(state.index),
        ahead: command.slice(state.index + 1, state.index + 3),
        isWordStart: state.text === '' && !state.isQuoted,
        redirect: state.redirect,
      },
      context,
    );

    advanceParser(state, action, context === 'plain');
  }

  endWord(state);

  return state.words;
}

function pickCodeAction(cursor: ShellCursor, context: ShellContext): ShellAction {
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

function pickArithmeticAction(cursor: ShellCursor, context: ShellContext): ShellAction {
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

// Each handler returns how many characters its action consumed. The table is typed over every
// action kind, so an action without a handler fails the type check.
export type ShellActionHandlers = {
  readonly [Kind in keyof ShellActionFields]: (
    state: ParserState,
    action: ShellActionOf<Kind>,
    isTopLevel: boolean,
  ) => number;
};

const actionHandlers: ShellActionHandlers = {
  text: appendText,
  redirect: (state, action) => {
    state.redirect = action.text;

    return appendText(state, action);
  },
  escape: (state, _action, isTopLevel) => {
    const escaped = state.command.charAt(state.index + 1);

    // A backslash before a newline joins the two lines into one.
    if (escaped !== '\n') {
      state.isPlain = false;
      state.text += escaped;
      state.isQuoted ||= isTopLevel;
    }

    return 2;
  },
  open: (state, action, isTopLevel) => {
    state.isPlain = false;

    state.contexts.push(action.context);

    state.text += action.text;
    state.isQuoted ||= isTopLevel && isQuoteContext(action.context);

    return Math.max(action.text.length, 1);
  },
  close: (state, action) => {
    state.contexts.pop();

    state.text += action.text;

    return Math.max(action.text.length, 1);
  },
  break: (state) => {
    endWord(state);

    return 1;
  },
  operator: (state, action) => {
    endWord(state);

    state.words.push({ text: action.text, isQuoted: false, isOperator: true, isAssignment: false });

    return action.text.length;
  },
  comment: (state) => {
    const end = state.command.indexOf('\n', state.index);

    return (end === -1 ? state.command.length : end) - state.index;
  },
};

// The handler table is generic over the action kind, so a call with the whole union still checks.
function advanceParser<Kind extends keyof ShellActionFields>(
  state: ParserState,
  action: ShellActionOf<Kind>,
  isTopLevel: boolean,
): void {
  const handler: ShellActionHandlers[Kind] = actionHandlers[action.kind];

  state.redirect = '';
  state.index += handler(state, action, isTopLevel);
}

function appendText(state: ParserState, action: ShellActionFields['text']): number {
  state.text += action.text;
  state.plainText += state.isPlain ? action.text : '';

  return 1;
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
