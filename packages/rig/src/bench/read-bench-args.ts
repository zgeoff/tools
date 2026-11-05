import { cli } from 'gunshi/bone';
import { define } from 'gunshi/definition';
import { formatParseError } from '../format-parse-error.ts';

export type BenchArgs =
  | { readonly kind: 'parsed'; readonly name: string | null; readonly baseRef: string | null }
  | { readonly kind: 'refused'; readonly reason: string };

const argSchema = {
  base: { type: 'string' },
  name: { type: 'positional', required: false },
} as const;

export async function readBenchArgs(args: readonly string[]): Promise<BenchArgs> {
  let parsed: BenchArgs | null = null;

  const command = define({
    name: 'rig bench',
    args: argSchema,
    run: (ctx) => {
      // The parser refuses `--base` with no value through an error whose own message is empty.
      if (ctx.validationError !== undefined) {
        parsed = { kind: 'refused', reason: '--base needs a ref' };

        return;
      }

      if (ctx.positionals.length > 1) {
        parsed = { kind: 'refused', reason: 'takes at most one benchmark name' };

        return;
      }

      parsed = { kind: 'parsed', name: ctx.values.name ?? null, baseRef: ctx.values.base ?? null };
    },
  });

  try {
    await cli([...args], command, { strict: true });
  } catch (error) {
    return { kind: 'refused', reason: formatParseError(error) };
  }

  return parsed ?? { kind: 'refused', reason: 'the command line could not be parsed' };
}
