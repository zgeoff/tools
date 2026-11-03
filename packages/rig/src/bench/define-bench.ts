import { parseDuration } from '../parse-duration.ts';

export interface BenchOptions {
  readonly name: string;

  // A duration such as `'50ms'` or `'2s'` that the median of a measured run must not pass.
  readonly budget: string;

  readonly setup?: () => Promise<unknown>;

  readonly run: (context: unknown) => Promise<void> | void;
}

export interface BenchDefinition {
  readonly name: string;

  readonly budgetMs: number;

  readonly setup: (() => Promise<unknown>) | null;

  readonly run: (context: unknown) => Promise<void> | void;
}

// A bench file default-exports the result, which `rig bench` imports and measures.
export function defineBench(options: BenchOptions): BenchDefinition {
  const budgetMs = parseDuration(options.budget);

  if (budgetMs === null) {
    throw new Error(
      `defineBench: the benchmark "${options.name}" has the budget "${options.budget}", which is no duration such as '50ms' or '2s'`,
    );
  }

  return { name: options.name, budgetMs, setup: options.setup ?? null, run: options.run };
}
