// A `--watch` run never exits, so the runs after it never start, and each `--coverage` run writes
// its report over the one before it. Both need the tests in one `bun test` run.
const singleRunFlags = ['--watch', '--coverage'];

export function findSingleRunFlag(flags: readonly string[]): string | undefined {
  return flags.find((flag) =>
    singleRunFlags.some(
      (name) => flag === name || flag.startsWith(`${name}=`) || flag.startsWith(`${name}-`),
    ),
  );
}
