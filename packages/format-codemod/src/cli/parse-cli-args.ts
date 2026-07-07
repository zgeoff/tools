import { parseArgs } from 'node:util';
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

/**
 * Strict parsing: an unknown flag is a usage error, not a silent no-op. That
 * matters because the default mode writes files — a typo'd --check must never
 * fall through to an in-place rewrite. CLIArgs is always an object, so the
 * string (error message) return is unambiguous.
 */
export function parseCLIArgs(argv: readonly string[]): CLIArgs | string {
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        check: { type: 'boolean', default: false },
        dry: { type: 'boolean', default: false },
        bench: { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
        ignore: { type: 'string', multiple: true, default: [] },
      },
      allowPositionals: true,
      strict: true,
    });

    return {
      mode: pickMode(parsed.values.check, parsed.values.dry),
      quiet: parsed.values.quiet,
      bench: parsed.values.bench,
      help: parsed.values.help,
      version: parsed.values.version,
      ignore: parsed.values.ignore,
      inputs: parsed.positionals,
    };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * --check wins over --dry when both are passed — the stricter mode's
 * no-writes guarantee must hold.
 */
function pickMode(check: boolean, dry: boolean): CLIMode {
  if (check) {
    return 'check';
  }

  return dry ? 'dry' : 'write';
}
