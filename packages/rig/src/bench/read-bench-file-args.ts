import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';
import { formatParseError } from '../format-parse-error.ts';

export type BenchFileArgs =
  | { readonly kind: 'parsed'; readonly file: string; readonly reportPath: string }
  | { readonly kind: 'refused'; readonly reason: string };

const argSchema = {
  file: { type: 'positional' },
  report: { type: 'string', required: true },
} as const;

export async function readBenchFileArgs(args: readonly string[]): Promise<BenchFileArgs> {
  let parsed: BenchFileArgs | null = null;

  const command = define({
    name: 'run-bench-file',
    args: argSchema,
    run: (ctx) => {
      if (ctx.validationError !== undefined) {
        parsed = { kind: 'refused', reason: formatParseError(ctx.validationError) };

        return;
      }

      parsed = { kind: 'parsed', file: ctx.values.file, reportPath: ctx.values.report };
    },
  });

  try {
    await cli([...args], command, { strict: true });
  } catch (error) {
    return { kind: 'refused', reason: formatParseError(error) };
  }

  return parsed ?? { kind: 'refused', reason: 'the command line could not be parsed' };
}
