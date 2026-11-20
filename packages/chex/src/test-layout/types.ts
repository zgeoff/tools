export interface SourceFile {
  readonly path: string;

  readonly text: string;
}

export interface WorkspacePackage {
  // The workspace folder, relative to the repo root.
  readonly root: string;

  // The `name` of its package.json, or an empty string when it has none.
  readonly name: string;

  // Whether its package.json has `"private": true`.
  readonly isPrivate: boolean;
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

  // The files that a `[test] preload` entry of a bunfig.toml names by a relative path, relative to
  // the repo root. They are test code.
  readonly testPreloads: readonly string[];

  // The name and privacy of each workspace's package.json.
  readonly workspacePackages: readonly WorkspacePackage[];
}
