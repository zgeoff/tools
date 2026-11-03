export interface SourceFile {
  readonly path: string;

  readonly text: string;
}

export interface TestLayout {
  // Every path git tracks.
  readonly trackedPaths: readonly string[];

  // The workspace folders of the root package.json, relative to the repo root.
  readonly workspaces: readonly string[];

  // Whether the root package.json declares `workspaces`. A repo without the field is one package.
  readonly isWorkspaceRepo: boolean;

  // The suffixes that lanes use, each with its dot, such as `.browser`.
  readonly laneSuffixes: readonly string[];
}
