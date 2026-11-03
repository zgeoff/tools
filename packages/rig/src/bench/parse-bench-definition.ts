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
  const setup: unknown = Reflect.get(value, 'setup');
  const run: unknown = Reflect.get(value, 'run');

  if (typeof name !== 'string' || typeof budgetMs !== 'number' || !isFunction(run)) {
    return { kind: 'refused', reason: 'the default export is no defineBench result' };
  }

  if (setup !== null && !isFunction(setup)) {
    return { kind: 'refused', reason: 'its setup is no function' };
  }

  return {
    kind: 'parsed',
    definition: {
      name,
      budgetMs,
      setup: setup === null ? null : () => Promise.resolve(setup()),
      run: async (context) => {
        await run(context);
      },
    },
  };
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}
