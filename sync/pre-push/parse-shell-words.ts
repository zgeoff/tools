type ShellContext = "'" | '"' | '$(' | '(' | '`';

export interface ShellWord {
  readonly text: string;
  readonly isQuoted: boolean;
  readonly isOperator: boolean;
}

// A shell reads a quoted character or one after a backslash as a literal, so `echo "a;b"` holds one
// command. A command substitution runs its contents as commands, inside double quotes too. A `&`
// next to `>` or `<` is a redirection, such as `2>&1` or `&>log`, and stays part of a word.
export function parseShellWords(command: string): ShellWord[] {
  const words: ShellWord[] = [];
  const contexts: ShellContext[] = [];
  let text = '';
  let isQuoted = false;

  const endWord = (): void => {
    if (text !== '' || isQuoted) {
      words.push({ text, isQuoted, isOperator: false });
    }

    text = '';
    isQuoted = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command.charAt(index);
    const next = command.charAt(index + 1);
    const context = contexts.at(-1);

    if (context === "'") {
      if (character === "'") {
        contexts.pop();
      } else {
        text += character;
      }
    } else if (context === '"' && character === '"') {
      contexts.pop();
    } else if (character === '\\') {
      index += 1;
      text += next;
      isQuoted ||= context === undefined;
    } else if (character === '$' && next === '(') {
      contexts.push('$(');

      text += '$(';
      index += 1;
    } else if (character === '`' && context === '`') {
      contexts.pop();
    } else if (character === '`') {
      contexts.push('`');
    } else if (context === '"') {
      text += character;
    } else if (character === "'" || character === '"') {
      contexts.push(character);

      isQuoted ||= context === undefined;
    } else if (character === '(' && (context === '$(' || context === '(')) {
      contexts.push('(');

      text += character;
    } else if (character === ')' && (context === '$(' || context === '(')) {
      contexts.pop();

      text += character;
    } else if (character === '#' && text === '' && !isQuoted && context === undefined) {
      break;
    } else if (/\s/u.test(character)) {
      endWord();
    } else if (character === ';' || character === '|' || isSeparatorAmpersand(command, index)) {
      endWord();

      const isDouble = character !== ';' && next === character;

      words.push({
        text: isDouble ? character + next : character,
        isQuoted: false,
        isOperator: true,
      });

      index += isDouble ? 1 : 0;
    } else {
      text += character;
    }
  }

  endWord();

  return words;
}

function isSeparatorAmpersand(command: string, index: number): boolean {
  const previous = command.charAt(index - 1);

  return (
    command.charAt(index) === '&' &&
    command.charAt(index + 1) !== '>' &&
    previous !== '>' &&
    previous !== '<'
  );
}
