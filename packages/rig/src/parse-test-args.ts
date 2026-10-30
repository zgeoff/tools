export interface TestArgs {
  readonly flags: readonly string[];

  readonly paths: readonly string[];
}

// An option of bun test takes its value after `=`, so every argument that is no option is a path,
// and rig needs no copy of the options that bun test reads a value for.
export function parseTestArgs(args: readonly string[]): TestArgs {
  return {
    flags: args.filter((arg) => arg.startsWith('-')),
    paths: args.filter((arg) => !arg.startsWith('-')),
  };
}
