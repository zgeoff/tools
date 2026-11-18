// `bun test --parallel` gives each file a fresh global, which hides a leak between files that the
// test preload's resets and the random order catch instead.
export const testRunArgs: readonly string[] = ['--randomize', '--no-isolate'];
