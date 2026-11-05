import type { BenchDefinition } from './define-bench.ts';
import { isConcurrencyList } from './is-concurrency-list.ts';

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

  // A bench file on a base ref can import an older rig, whose result has no concurrency.
  const concurrency: unknown = Reflect.get(value, 'concurrency') ?? [1];

  if (
    typeof name !== 'string' ||
    typeof budgetMs !== 'number' ||
    !isFunction(prepare) ||
    !isConcurrencyList(concurrency)
  ) {
    return { kind: 'refused', reason: 'the default export is no defineBench result' };
  }

  return {
    kind: 'parsed',
    definition: {
      name,
      budgetMs,
      concurrency,
      prepare: async () => {
        const prepared: unknown = await prepare();

        const step: unknown =
          typeof prepared === 'object' && prepared !== null ? Reflect.get(prepared, 'step') : null;

        const dispose: unknown =
          typeof prepared === 'object' && prepared !== null
            ? Reflect.get(prepared, 'dispose')
            : null;

        if (!isFunction(step) || !isFunction(dispose)) {
          throw new Error(`the benchmark "${name}" prepared no step to measure`);
        }

        return {
          step: async () => {
            await step();
          },
          dispose: async () => {
            await dispose();
          },
        };
      },
    },
  };
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}
