import { docsCheckNames } from '../../packages/chex/src/check-names.ts';
import { parseChexArgs } from '../../packages/chex/src/parse-chex-args.ts';

export type DocsChecks =
  | { readonly kind: 'none' }
  | { readonly kind: 'named'; readonly checks: readonly string[] }
  | { readonly kind: 'refused'; readonly message: string };

// CI runs each docs check that the repo's check:docs script names as its own step, so the script
// holds chex and the names alone, as chex init writes it.
export function parseDocsChecks(script: string | undefined): DocsChecks {
  if (script === undefined) {
    return { kind: 'none' };
  }

  const [program, ...words] = script.trim().split(/\s+/u);
  const request = parseChexArgs(words);

  if (
    program === 'chex' &&
    request.kind === 'checks' &&
    request.args.length === 0 &&
    request.names.every((name) => docsCheckNames.some((docsName) => docsName === name))
  ) {
    return { kind: 'named', checks: request.names };
  }

  return {
    kind: 'refused',
    message: `package.json runs "${script}" as check:docs; write it as chex and the docs checks it takes, from ${docsCheckNames.join(', ')}, such as "chex prose length links", so CI runs each check as its own step.`,
  };
}
