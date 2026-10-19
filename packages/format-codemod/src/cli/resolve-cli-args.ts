import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';
import type { CLIMode } from './types.ts';

export interface CLIArgs {
  readonly mode: CLIMode;
  readonly quiet: boolean;
  readonly bench: boolean;
  readonly help: boolean;
  readonly version: boolean;
  readonly ignore: readonly string[];
  readonly inputs: readonly string[];
}

const CLI_ARGS = {
  check: { type: 'boolean', default: false },
  dry: { type: 'boolean', default: false },
  bench: { type: 'boolean', default: false },
  quiet: { type: 'boolean', default: false },
  version: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
  ignore: { type: 'string', multiple: true },
} as const;

export async function resolveCLIArgs(argv: readonly string[]): Promise<CLIArgs | string> {
  let parsed: CLIArgs | null = null;

  const command = define({
    name: 'format-codemod',
    args: CLI_ARGS,
    run: (ctx) => {
      if (ctx.validationError !== undefined) {
        throw ctx.validationError;
      }

      parsed = {
        mode: pickMode(ctx.values.check, ctx.values.dry),
        quiet: ctx.values.quiet,
        bench: ctx.values.bench,
        help: ctx.values.help,
        version: ctx.values.version,
        ignore: ctx.values.ignore ?? [],

        // An input after `--` may start with a dash, and it is an input too.
        inputs: [...ctx.positionals, ...ctx.rest],
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

function pickMode(check: boolean, dry: boolean): CLIMode {
  if (check) {
    return 'check';
  }

  return dry ? 'dry' : 'write';
}

// The parser throws one error that holds every reason the command line is
// refused, so each reason prints on a line of its own.
function formatParseError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((reason) => formatParseError(reason)).join('\n');
  }

  return error instanceof Error ? error.message : String(error);
}
