// One problem a check found, at a line of a file. The runner prints it as
// `path:line: <check>: <message>`.
export interface Finding {
  // Relative to the repo root.
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

export interface CheckContext {
  // The repo root; every path in `files` is relative to it.
  readonly cwd: string;

  // The files that match the check's glob, never empty.
  readonly files: readonly string[];

  // The environment of the programs the check runs, PATH included.
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface Check {
  // The name a finding prints and a config entry turns off.
  readonly name: string;

  // A Bun glob that a file's repo-relative path must match for the check to see it.
  readonly glob: string;

  readonly check: (context: CheckContext) => Finding[] | Promise<Finding[]>;
}
