import { parseDuration } from '../parse-duration.ts';

interface BenchBaseOptions {
  readonly name: string;

  // A duration such as `'50ms'` or `'2s'` that the median of a measured run must not pass.
  readonly budget: string;
}

interface BenchSetupOptions<Context> extends BenchBaseOptions {
  readonly setup: () => Promise<Context>;

  readonly run: (context: Context) => Promise<void> | void;
}

interface BenchPlainOptions extends BenchBaseOptions {
  readonly setup?: undefined;

  readonly run: () => Promise<void> | void;
}

export type BenchOptions<Context> = BenchSetupOptions<Context> | BenchPlainOptions;

export interface BenchDefinition {
  readonly name: string;

  readonly budgetMs: number;

  // Runs `setup` and returns the step to measure, which holds the setup result.
  readonly prepare: () => Promise<() => Promise<void> | void>;
}

// A bench file default-exports the result, which `rig bench` imports and measures.
export function defineBench<Context>(options: BenchOptions<Context>): BenchDefinition {
  const budgetMs = parseDuration(options.budget);

  if (budgetMs === null) {
    throw new Error(
      `defineBench: the benchmark "${options.name}" has the budget "${options.budget}", which is no duration such as '50ms' or '2s'`,
    );
  }

  return {
    name: options.name,
    budgetMs,
    prepare: async () => {
      if (options.setup === undefined) {
        return () => options.run();
      }

      const context = await options.setup();

      return () => options.run(context);
    },
  };
}
