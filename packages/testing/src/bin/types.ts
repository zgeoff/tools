export interface StubAnswer {
  // Matches a call whose argv starts with these.
  readonly args: readonly string[];

  // 0 when it is unset.
  readonly exitCode?: number;

  readonly stdout?: string;

  readonly stderr?: string;
}

export type StubBinOptions =
  | {
      // Left out: every call exits 0. Given, even as []: a call that matches no answer exits 97.
      readonly answers?: readonly StubAnswer[];

      // Env names to copy into each call's record.
      readonly recordEnv?: readonly string[];

      // False when it is unset.
      readonly recordStdin?: boolean;
    }
  | {
      // The test's script, with its own shebang, run in place of answers.
      readonly script: string;

      readonly recordEnv?: readonly string[];

      readonly recordStdin?: boolean;
    };

export interface StubCall {
  readonly name: string;

  // Exactly as the stand-in received them.
  readonly argv: readonly string[];

  readonly cwd: string;

  // Only the recordEnv names that were set.
  readonly env: Readonly<Record<string, string>>;

  // '' without recordStdin. With it, all of stdin up to EOF, or '' when stdin is a terminal.
  readonly stdin: string;
}

export interface StubBin {
  // <directory>/<name>
  readonly path: string;

  // This stand-in's calls only.
  readonly readCalls: () => readonly StubCall[];
}

// What the stand-in reads from its config file beside it.
export interface StubConfig {
  readonly answers: readonly StubAnswer[] | null;
  readonly hasScript: boolean;
  readonly recordEnv: readonly string[];
  readonly recordStdin: boolean;
}
