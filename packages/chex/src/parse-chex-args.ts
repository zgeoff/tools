import type { CheckName } from './check-names.ts';
import { checkNames, isCheckName } from './check-names.ts';

export type ChexRequest =
  | { readonly kind: 'init' }
  | {
      readonly kind: 'checks';
      readonly names: readonly CheckName[];
      readonly args: readonly string[];
    }
  | { readonly kind: 'refused'; readonly message: string };

const checksWithArgs: ReadonlySet<CheckName> = new Set([
  'prose',
  'links',
  'skill',
  'commits',
  'local-paths',
  'workflows',
]);

export const chexUsage = `usage: chex <check>... | chex <check> [args...] | chex init
checks: ${checkNames.join(', ')}`;

export function parseChexArgs(argv: readonly string[]): ChexRequest {
  const [first, ...rest] = argv;

  if (first === undefined) {
    return { kind: 'refused', message: 'name a check to run' };
  }

  if (first === 'init') {
    return rest.length === 0
      ? { kind: 'init' }
      : { kind: 'refused', message: 'init takes no arguments' };
  }

  const firstArg = argv.findIndex((word) => !isCheckName(word));

  const names = (firstArg === -1 ? argv : argv.slice(0, firstArg)).filter((word) =>
    isCheckName(word),
  );

  const args = firstArg === -1 ? [] : argv.slice(firstArg);
  const [only, ...others] = names;

  if (only === undefined) {
    return { kind: 'refused', message: `unknown check "${first}"` };
  }

  if (args.length === 0) {
    return { kind: 'checks', names: [...new Set(names)], args };
  }

  if (others.length > 0) {
    return {
      kind: 'refused',
      message: `"${args[0]}" is no check name; arguments follow one check name alone`,
    };
  }

  if (!checksWithArgs.has(only)) {
    return { kind: 'refused', message: `${only} takes no arguments, and got "${args[0]}"` };
  }

  return { kind: 'checks', names, args };
}
