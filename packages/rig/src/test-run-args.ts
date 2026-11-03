// Every `bun test` that rig starts runs its files in random order in one global per process.
// `--parallel` alone gives each file a fresh global, which hides a leak between files that the
// test preload's resets and the random order catch instead.
export const testRunArgs: readonly string[] = ['--randomize', '--no-isolate'];
