import { docsCheckNames } from '../../packages/chex/src/check-names.ts';

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

  const [program, ...checks] = script.trim().split(/\s+/u);
  const unknown = checks.filter((check) => !docsCheckNames.some((name) => name === check));

  if (program !== 'chex' || checks.length === 0 || unknown.length > 0) {
    return {
      kind: 'refused',
      message: `package.json runs "${script}" as check:docs; write it as chex and the docs checks it takes, from ${docsCheckNames.join(', ')}, such as "chex prose length links", so CI runs each check as its own step.`,
    };
  }

  return { kind: 'named', checks: [...new Set(checks)] };
}
