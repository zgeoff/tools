import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';

export interface CLIArgs {
  readonly command: string;

  // Every argument after the command, flags and paths alike, which the command passes on to
  // `bun test`.
  readonly extraArgs: readonly string[];
}

const argSchema = { command: { type: 'positional' } } as const;

// The parser reads only the command, because `bun run <script> -- --seed=1` drops the `--` before
// rig starts, so a flag meant for `bun test` arrives with nothing to mark it.
export async function readCLIArgs(argv: readonly string[]): Promise<CLIArgs | string> {
  let parsed: CLIArgs | null = null;

  const command = define({
    name: 'rig',
    args: argSchema,
    run: (ctx) => {
      if (ctx.validationError !== undefined) {
        throw ctx.validationError;
      }

      parsed = {
        command: ctx.values.command,
        extraArgs: dropFirstSeparator(argv.slice(1)),
      };
    },
  });

  try {
    await cli(argv.slice(0, 1), command, { strict: true });
  } catch (error) {
    return formatParseError(error);
  }

  return parsed ?? 'the command line could not be parsed';
}

function dropFirstSeparator(args: readonly string[]): readonly string[] {
  const separator = args.indexOf('--');

  return separator === -1 ? args : args.toSpliced(separator, 1);
}

// The parser throws one error that holds every reason the command line is refused, so each reason
// prints on a line of its own.
function formatParseError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((reason) => formatParseError(reason)).join('\n');
  }

  return error instanceof Error ? error.message : String(error);
}
