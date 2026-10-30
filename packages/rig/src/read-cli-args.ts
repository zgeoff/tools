import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';

export interface CLIArgs {
  readonly command: string;

  // Paths and, after `--`, the flags that the command passes on to `bun test`.
  readonly extraArgs: readonly string[];
}

const argSchema = { command: { type: 'positional' } } as const;

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
        extraArgs: [...ctx.positionals.slice(1), ...ctx.rest],
      };
    },
  });

  try {
    await cli([...argv], command, { strict: true });
  } catch (error) {
    return formatParseError(error);
  }

  return parsed ?? 'the command line could not be parsed';
}

// The parser throws one error that holds every reason the command line is refused, so each reason
// prints on a line of its own.
function formatParseError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((reason) => formatParseError(reason)).join('\n');
  }

  return error instanceof Error ? error.message : String(error);
}
