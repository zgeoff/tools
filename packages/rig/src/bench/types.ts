// One line of the report that a bench file process appends for `rig bench` to read: one benchmark
// at one concurrency level.
export interface BenchReportEntry {
  // Two bench files can define benchmarks of the same name, so the file tells them apart.
  readonly file: string;

  readonly name: string;

  readonly concurrency: number;

  readonly medianMs: number;

  readonly spreadMs: number;

  readonly budgetMs: number;
}

export interface BenchSideTimes {
  readonly medianMs: number;

  readonly spreadMs: number;
}

// One benchmark at one level, with its times on the base and on the head, or null on a side that
// lacks it.
export interface BenchComparisonRow {
  // The bench file, relative to the root of its side, so both sides give the same path.
  readonly file: string;

  readonly name: string;

  readonly concurrency: number;

  readonly base: BenchSideTimes | null;

  readonly head: BenchSideTimes | null;
}
