// One problem a check found, at a line of a file or of a commit. The runner prints it as
// `path:line: <check>: <message>`.
export interface Finding {
  // Relative to the repo root, or the short hash of the commit for a check of the commits.
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

export interface BranchCheckContext {
  // The repo root.
  readonly cwd: string;

  // The commit the branch grows from; the check reads the commits after it, up to HEAD.
  readonly base: string;

  // The environment of the programs the check runs, PATH included.
  readonly env: Readonly<Record<string, string | undefined>>;
}

// A check of the files that match its glob.
export interface FileCheck {
  readonly kind: 'files';

  // The name a finding prints and a config entry turns off.
  readonly name: string;

  // A Bun glob that a file's repo-relative path must match for the check to see it.
  readonly glob: string;

  readonly check: (context: CheckContext) => Finding[] | Promise<Finding[]>;
}

// A check of the commits that the branch adds, which runs whatever files the run lists.
export interface BranchCheck {
  readonly kind: 'branch';

  // The name a finding prints and a config entry turns off.
  readonly name: string;

  readonly check: (context: BranchCheckContext) => Finding[] | Promise<Finding[]>;
}

export type Check = FileCheck | BranchCheck;
