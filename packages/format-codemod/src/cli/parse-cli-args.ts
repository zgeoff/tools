import { parseArgs } from 'node:util';
import type { CliMode } from '../types.ts';

export interface CliArgs {
  readonly mode: CliMode;
  readonly quiet: boolean;
  readonly bench: boolean;
  readonly help: boolean;
  readonly version: boolean;
  readonly inputs: readonly string[];
}

// Strict parsing: an unknown flag is a usage error, not a silent no-op. That
// matters because the default mode writes files — a typo'd --check must never
// fall through to an in-place rewrite. CliArgs is always an object, so the
// string (error message) return is unambiguous.
export function parseCliArgs(argv: readonly string[]): CliArgs | string {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: {
        check: { type: 'boolean', default: false },
        dry: { type: 'boolean', default: false },
        bench: { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: true,
    });

    return {
      mode: pickMode(values.check, values.dry),
      quiet: values.quiet,
      bench: values.bench,
      help: values.help,
      version: values.version,
      inputs: positionals,
    };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// --check wins over --dry when both are passed, matching the old flag order.
function pickMode(check: boolean, dry: boolean): CliMode {
  if (check) {
    return 'check';
  }

  return dry ? 'dry' : 'write';
}
