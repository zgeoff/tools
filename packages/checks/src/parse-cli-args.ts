import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';

export interface CLIArgs {
  readonly help: boolean;

  // The files to check; empty means every file that git tracks.
  readonly files: readonly string[];
}

// Parses the command line, or returns the reason it is refused. Bun drops the first -- before the
// module runs, so a --help that followed it reads as the option: help with files is refused, so it
// can never stand in for a run over those files.
export async function parseCLIArgs(argv: readonly string[]): Promise<CLIArgs | string> {
  let parsed: CLIArgs | null = null;

  const command = define({
    name: 'zgeoff-check',
    args: {
      help: { type: 'boolean', short: 'h', default: false },
    },
    run: (ctx) => {
      if (ctx.validationError !== undefined) {
        throw ctx.validationError;
      }

      parsed = { help: ctx.values.help, files: [...ctx.positionals, ...ctx.rest] };
    },
  });

  try {
    await cli([...argv], command, { strict: true });
  } catch (error) {
    return formatParseError(error);
  }

  if (parsed === null) {
    return 'the command line could not be parsed';
  }

  const args: CLIArgs = parsed;

  if (args.help && args.files.length > 0) {
    return '--help takes no files';
  }

  return args;
}

// The parser throws one error that holds every reason the command line is refused, so each reason
// prints on a line of its own.
function formatParseError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((reason) => formatParseError(reason)).join('\n');
  }

  return error instanceof Error ? error.message : String(error);
}
