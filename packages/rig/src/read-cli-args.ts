import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';
import { formatParseError } from './format-parse-error.ts';

export interface CLIArgs {
  readonly command: string;

  // Every argument after the command, flags and paths alike, which the command passes on to
  // `bun test`.
  readonly extraArgs: readonly string[];

  readonly hasIsolateOption: boolean;
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
        hasIsolateOption: false,
      };
    },
  });

  try {
    await cli(argv.slice(0, 1), command, { strict: true });
  } catch (error) {
    return formatParseError(error);
  }

  if (parsed === null) {
    return 'the command line could not be parsed';
  }

  const commandArgs: CLIArgs = parsed;

  return { ...commandArgs, hasIsolateOption: await probeIsolateOption(commandArgs.extraArgs) };
}

function dropFirstSeparator(args: readonly string[]): readonly string[] {
  const separator = args.indexOf('--');

  return separator === -1 ? args : args.toSpliced(separator, 1);
}

const forwardedArgSchema = { isolate: { type: 'boolean' } } as const;

// The forwarded arguments hold `bun test` options that rig never declares, so this parse is not
// strict, and it reads only whether an isolate option, in any of its forms, is among them.
async function probeIsolateOption(args: readonly string[]): Promise<boolean> {
  let isExplicit = false;

  const forwarded = define({
    name: 'rig',
    args: forwardedArgSchema,
    run: (ctx) => {
      isExplicit = ctx.explicit.isolate;
    },
  });

  await cli([...args], forwarded, { strict: false });

  return isExplicit;
}
