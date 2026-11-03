export type Signal = 'SIGTERM' | 'SIGINT' | 'SIGHUP' | 'SIGKILL';

// Added to the test process's environment. An undefined value removes the variable.
type Environment = Readonly<Record<string, string | undefined>>;

export interface RunOptions {
  readonly args?: readonly string[];

  readonly env?: Environment;

  readonly cwd?: string;

  // Written to the program's stdin, which then closes. Without it, stdin is empty.
  readonly input?: string;

  // When the program runs longer, its process group gets SIGKILL and the run throws.
  readonly timeoutMs?: number;
}

export interface RunResult {
  readonly exitCode: number;

  readonly stdout: string;

  readonly stderr: string;
}

export type Ready =
  | { readonly url: string }
  | { readonly stdout: string | RegExp }
  | { readonly check: () => Promise<boolean> };

export interface StartOptions {
  // A function gets the picked port, for a program that takes it by flag.
  readonly args?: readonly string[] | ((port: number) => readonly string[]);

  // A function gets the picked port, for a program that reads it from another variable. `PORT` is
  // set either way.
  readonly env?: Environment | ((port: number) => Environment);

  readonly cwd?: string;

  // The port to give the program. A free port when it is unset.
  readonly port?: number;

  // How the start knows the program is ready. Without it, the start returns at once.
  readonly ready?: Ready;

  // How long to wait for the program to be ready; 10 s when it is unset.
  readonly readyTimeoutMs?: number;
}

export interface WaitForLineOptions {
  // How long to wait for a line; 10 s when it is unset.
  readonly timeoutMs?: number;
}

export interface ProcessHandle extends AsyncDisposable {
  // The `http://127.0.0.1:<port>` base the program listens on.
  readonly url: string;

  readonly port: number;

  // The program's process ID, which is also the ID of the process group it leads.
  readonly pid: number;

  // The first whole stdout line that `ready: { stdout }` matched, or null for any other `ready`.
  readonly readyLine: string | null;

  // Writes to the program's stdin.
  readonly write: (text: string) => Promise<void>;

  // Resolves with the first whole stdout line after the last line that it or `ready: { stdout }`
  // matched, that matches the pattern.
  readonly waitForLine: (pattern: string | RegExp, options?: WaitForLineOptions) => Promise<string>;

  // The stdout and stderr so far.
  readonly output: () => string;

  // Sends the signal, SIGTERM when it is unset, to the program's process group. Waits for the
  // program to exit and the group to empty, with SIGKILL for what is left after 5 s. Returns the
  // exit code, which is 128 plus the signal's number when a signal killed the program.
  readonly stop: (signal?: Signal) => Promise<number>;
}
