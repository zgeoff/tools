import { formatBenchmarkResult } from './bench/format-benchmark-result.ts';
import { parseBenchDefinition } from './bench/parse-bench-definition.ts';
import { runBenchmark } from './bench/run-benchmark.ts';

// `rig bench` runs this once per bench file, in the environment the benchmarks get.
const file = process.argv[2] ?? '';

const loaded: unknown = await import(file);

const defaultExport: unknown =
  typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : null;

const parsed = parseBenchDefinition(defaultExport);

if (parsed.kind === 'refused') {
  process.stderr.write(`rig bench: ${file}: ${parsed.reason}\n`);

  process.exitCode = 2;
} else {
  const result = await runBenchmark(parsed.definition, () => performance.now());

  process.stdout.write(formatBenchmarkResult(parsed.definition, result));

  process.exitCode = result.medianMs > parsed.definition.budgetMs ? 1 : 0;
}
