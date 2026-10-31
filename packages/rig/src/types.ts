export interface LaneDeclaration {
  // The file suffix that selects the lane's tests, such as `.kiln`; defaults to `.<name>`.
  readonly suffix?: string;

  // A duration such as `'15s'` or `'1500ms'`; a lane that is not built in must declare one.
  readonly limit?: string;

  // A diet budget such as `'8G'`.
  readonly memory?: string;

  // Paths relative to the repo root of modules whose default export is the hook.
  readonly start?: string;

  readonly stop?: string;
}

export interface RigDeclaration {
  readonly lanes?: Readonly<Record<string, LaneDeclaration>>;
}

export type LaneParallelism = 'workers' | number;

export interface ResolvedLane {
  readonly name: string;

  // Null for the unit lane and the e2e lane, which select their tests by directory or by leaving
  // the other lanes out.
  readonly suffix: string | null;

  readonly limitMs: number;

  readonly parallel: LaneParallelism;

  readonly memory: string | null;

  readonly start: string | null;

  readonly stop: string | null;
}

export interface RigConfig {
  readonly lanes: readonly ResolvedLane[];
}

export interface LaneContext {
  readonly repoRoot: string;

  readonly lane: ResolvedLane;

  readonly runID: string;

  readonly environment: Readonly<Record<string, string | undefined>>;
}

export interface LaneStart {
  // Added to the environment of the lane's test process.
  readonly environment?: Readonly<Record<string, string>>;
}

// The process a command runs in: its repo, environment and abort signal.
export interface RigRun {
  readonly repoRoot: string;

  readonly environment: Readonly<Record<string, string | undefined>>;

  readonly signal: AbortSignal;

  readonly runID: string;
}

export interface RigOutput {
  readonly out: (text: string) => void;

  readonly err: (text: string) => void;
}
