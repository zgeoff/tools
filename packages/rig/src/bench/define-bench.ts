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

// What `prepare` hands the runner: the step it measures, and `dispose`, which it calls once after the
// measured runs, even when a run throws.
export interface PreparedBench {
  readonly step: () => Promise<void> | void;

  readonly dispose: () => Promise<void>;
}

export interface BenchDefinition {
  readonly name: string;

  readonly budgetMs: number;

  // Runs `setup` and returns the step to measure, which holds the setup result, and its disposal.
  readonly prepare: () => Promise<PreparedBench>;
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
        return { step: () => options.run(), dispose: () => Promise.resolve() };
      }

      const context = await options.setup();

      return { step: () => options.run(context), dispose: () => runContextDispose(context) };
    },
  };
}

// A setup result that holds a resource, such as a handle to a program that setup started, is
// disposed of through its `Symbol.asyncDispose`, so the program stops.
async function runContextDispose(context: unknown): Promise<void> {
  if ((typeof context !== 'object' && typeof context !== 'function') || context === null) {
    return;
  }

  const dispose: unknown = Reflect.get(context, Symbol.asyncDispose);

  if (typeof dispose === 'function') {
    await Reflect.apply(dispose, context, []);
  }
}
