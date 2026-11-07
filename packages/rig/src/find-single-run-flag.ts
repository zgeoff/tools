// A `--watch` run never exits, so the runs after it never start. Each `--coverage` or
// `--reporter-outfile` run writes its file relative to its own folder, or over the one before it,
// and a relative `--preload` resolves against each run's folder. All need one `bun test` run.
const singleRunFlags = ['--watch', '--coverage', '--reporter-outfile', '--preload'];

export function findSingleRunFlag(flags: readonly string[]): string | undefined {
  return flags.find((flag) =>
    singleRunFlags.some(
      (name) => flag === name || flag.startsWith(`${name}=`) || flag.startsWith(`${name}-`),
    ),
  );
}
