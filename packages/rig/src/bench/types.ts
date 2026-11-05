export interface BenchOutput {
  readonly stream: 'out' | 'err';

  readonly text: string;
}

// What `rig bench` prints, in order, and the exit code it returns after.
export interface BenchVerdict {
  readonly output: readonly BenchOutput[];

  readonly exitCode: number;
}

// What became of the base checkout after its removal: `absent` when the removal failed and git
// registers no such worktree, `left` when git still registers it or its list failed.
export type CheckoutState = 'removed' | 'absent' | 'left';

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
