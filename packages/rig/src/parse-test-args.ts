// bun test reads the next argument as the value of these options when no `=` joins them, so that
// argument is no path. Every other option of bun test takes no value or needs the `=`.
const optionsWithValue = new Set([
  '--timeout',
  '--rerun-each',
  '--retry',
  '--seed',
  '--coverage-reporter',
  '--coverage-dir',
  '-t',
  '--test-name-pattern',
  '--reporter',
  '--reporter-outfile',
  '--max-concurrency',
  '--path-ignore-patterns',
  '--parallel-delay',
  '--shard',
  '--timings',
  '-r',
  '--preload',
]);

export interface TestArgs {
  readonly flags: readonly string[];

  readonly paths: readonly string[];
}

export function parseTestArgs(args: readonly string[]): TestArgs {
  const flags: string[] = [];
  const paths: string[] = [];

  for (const [index, arg] of args.entries()) {
    const previous = args[index - 1];
    const isOptionValue = previous !== undefined && optionsWithValue.has(previous);

    if (arg.startsWith('-') || isOptionValue) {
      flags.push(arg);
    } else {
      paths.push(arg);
    }
  }

  return { flags, paths };
}
