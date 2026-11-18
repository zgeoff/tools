export interface SingleRunFlag {
  readonly flag: string;

  // True when the flag writes or reads a path that resolves against the folder the run starts from.
  readonly holdsPath: boolean;
}

// A `--watch` run never exits, so the runs after it never start. Each `--coverage` or
// `--reporter-outfile` run writes its file relative to its own folder, or over the one before it,
// and a relative `--preload` resolves against each run's folder. All need one `bun test` run.
const singleRunFlags = [
  { name: '--watch', holdsPath: false },
  { name: '--coverage', holdsPath: true },
  { name: '--reporter-outfile', holdsPath: true },
  { name: '--preload', holdsPath: true },
];

export function findSingleRunFlag(flags: readonly string[]): SingleRunFlag | undefined {
  for (const flag of flags) {
    const known = singleRunFlags.find(
      (candidate) =>
        flag === candidate.name ||
        flag.startsWith(`${candidate.name}=`) ||
        flag.startsWith(`${candidate.name}-`),
    );

    if (known !== undefined) {
      return { flag, holdsPath: known.holdsPath };
    }
  }

  return undefined;
}
