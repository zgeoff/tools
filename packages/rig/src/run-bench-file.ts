import { appendFile } from 'node:fs/promises';
import { formatBenchReport } from './bench/format-bench-report.ts';
import { formatBenchmarkResult } from './bench/format-benchmark-result.ts';
import { parseBenchDefinition } from './bench/parse-bench-definition.ts';
import { readBenchFileArgs } from './bench/read-bench-file-args.ts';
import { runBenchmark } from './bench/run-benchmark.ts';

// `rig bench` runs this once per bench file, in the environment the benchmarks get, and judges the
// budget from the report this appends, so a bench that ran exits 0 whatever its median.
const args = await readBenchFileArgs(process.argv.slice(2));

if (args.kind === 'refused') {
  process.stderr.write(`rig bench: ${args.reason}\n`);

  process.exitCode = 2;
} else {
  const loaded: unknown = await import(args.file);

  const defaultExport: unknown =
    typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : null;

  const parsed = parseBenchDefinition(defaultExport);

  if (parsed.kind === 'refused') {
    process.stderr.write(`rig bench: ${args.file}: ${parsed.reason}\n`);

    process.exitCode = 2;
  } else {
    const results = await runBenchmark(parsed.definition, () => performance.now());

    process.stdout.write(formatBenchmarkResult(parsed.definition, results));

    await appendFile(args.reportPath, formatBenchReport(parsed.definition, results));
  }
}
