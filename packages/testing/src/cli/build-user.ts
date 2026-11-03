import type { Key, User } from './types.ts';

const keyCodes = {
  up: '\u001B[A',
  down: '\u001B[B',
  right: '\u001B[C',
  left: '\u001B[D',
  space: ' ',
  enter: '\r',
  tab: '\t',
  escape: '\u001B',
  backspace: '\u007F',
} as const satisfies Record<Key, string>;

const ctrlC = '\u0003';

// A person at the keyboard: each method writes the key codes to the terminal.
export function buildUser(writeInput: (text: string) => void): User {
  // Waits a macrotask, so the program reads the keys before the test goes on.
  const writeThenFlush = async (text: string): Promise<void> => {
    writeInput(text);

    await Bun.sleep(0);
  };

  return {
    type: (text) => writeThenFlush(text),
    pressEnter: () => writeThenFlush(keyCodes.enter),
    press: (key) => writeThenFlush(keyCodes[key]),
    cancel: () => writeThenFlush(ctrlC),
  };
}
