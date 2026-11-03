import type { BenchDefinition } from './define-bench.ts';

export type ParsedBenchDefinition =
  | { readonly kind: 'parsed'; readonly definition: BenchDefinition }
  | { readonly kind: 'refused'; readonly reason: string };

// A bench file is outside input, so the runner checks that its default export is a `defineBench`
// result instead of trusting its type.
export function parseBenchDefinition(value: unknown): ParsedBenchDefinition {
  if (typeof value !== 'object' || value === null) {
    return { kind: 'refused', reason: 'the default export is no defineBench result' };
  }

  const name: unknown = Reflect.get(value, 'name');
  const budgetMs: unknown = Reflect.get(value, 'budgetMs');
  const prepare: unknown = Reflect.get(value, 'prepare');

  if (typeof name !== 'string' || typeof budgetMs !== 'number' || !isFunction(prepare)) {
    return { kind: 'refused', reason: 'the default export is no defineBench result' };
  }

  return {
    kind: 'parsed',
    definition: {
      name,
      budgetMs,
      prepare: async () => {
        const step: unknown = await prepare();

        if (!isFunction(step)) {
          throw new Error(`the benchmark "${name}" prepared no step to measure`);
        }

        return async () => {
          await step();
        };
      },
    },
  };
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}
