export interface ScreenLink {
  readonly text: string;

  readonly href: string;

  // The part of the sequence before the link, such as `id=7`; empty when there is none.
  readonly params: string;
}

export interface FindByTextOptions {
  // How long to wait for a match; 5 s when it is unset.
  readonly timeoutMs?: number;
}

// A string matches a substring of a line, and a RegExp matches a line by `test`.
export type TextPattern = string | RegExp;

export interface Screen {
  // The first line of the screen that matches. Throws with the screen text on a miss.
  readonly getByText: (pattern: TextPattern) => string;

  // The first line that matches, or null.
  readonly queryByText: (pattern: TextPattern) => string | null;

  // Waits for a line that matches. Throws with the screen text when the wait runs out.
  readonly findByText: (pattern: TextPattern, options?: FindByTextOptions) => Promise<string>;

  // Every line that matches, in screen order.
  readonly getAllByText: (pattern: TextPattern) => string[];

  // The text a person sees: redrawn frames collapsed and escape sequences removed.
  readonly text: () => string;

  // The OSC 8 hyperlinks the program wrote.
  readonly links: () => ScreenLink[];
}

export type Key =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'space'
  | 'enter'
  | 'tab'
  | 'escape'
  | 'backspace';

export interface User {
  // Writes characters, with no line break.
  readonly type: (text: string) => Promise<void>;

  readonly pressEnter: () => Promise<void>;

  readonly press: (key: Key) => Promise<void>;

  // Writes Ctrl+C.
  readonly cancel: () => Promise<void>;
}

export interface SpawnCLIOptions {
  // Arguments added after the command.
  readonly args?: readonly string[];

  readonly cwd?: string;

  // Added to the test's environment. `TERM` is `xterm-256color` unless this sets it.
  readonly env?: Readonly<Record<string, string>>;

  // The terminal's width; 80 when it is unset.
  readonly cols?: number;

  // The terminal's height; 24 when it is unset.
  readonly rows?: number;

  // When false, the program's output also goes to the test runner's terminal. True when it is unset.
  readonly silent?: boolean;
}

export interface SpawnedCLI extends AsyncDisposable {
  readonly screen: Screen;

  readonly user: User;

  readonly resize: (cols: number, rows: number) => void;

  // Resolves with the exit code, which is 128 plus the signal's number when a signal killed the
  // program.
  readonly result: Promise<number>;

  // The exit code, or null while the program runs.
  readonly exitCode: () => number | null;

  // Sends the signal, SIGTERM when it is unset. It does nothing once the program has exited.
  readonly kill: (signal?: NodeJS.Signals) => void;
}
