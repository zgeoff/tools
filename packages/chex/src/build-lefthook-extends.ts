import { isRecord } from './dependency-gates/is-record.ts';

export const baselinePath = 'node_modules/@zgeoff/chex/lefthook.yml';

export type LefthookOutcome =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'changed'; readonly text: string }
  | { readonly kind: 'refused'; readonly reason: string };

const extendsLine = /^extends:[ \t]*(?:#.*)?$/mu;

// Edits the text rather than writing parsed YAML back, so the repo's comments and layout stay.
export function buildLefthookExtends(text: string | null): LefthookOutcome {
  if (text === null) {
    return { kind: 'changed', text: `extends:\n  - ${baselinePath}\n` };
  }

  const config = parseConfig(text);

  if (config === undefined) {
    return { kind: 'refused', reason: 'lefthook.yml is not a YAML mapping' };
  }

  const extended = config['extends'];

  if (extended === undefined) {
    return { kind: 'changed', text: `extends:\n  - ${baselinePath}\n\n${text}` };
  }

  if (Array.isArray(extended) && extended.includes(baselinePath)) {
    return { kind: 'unchanged' };
  }

  const match = extendsLine.exec(text);

  if (!Array.isArray(extended) || match === null) {
    return {
      kind: 'refused',
      reason: `lefthook.yml writes extends in a form chex init does not edit; add ${baselinePath} to its list`,
    };
  }

  const end = match.index + match[0].length;
  const edited = `${text.slice(0, end)}\n  - ${baselinePath}${text.slice(end)}`;
  const editedConfig = parseConfig(edited);
  const editedExtends = editedConfig?.['extends'];

  return Array.isArray(editedExtends) && editedExtends.includes(baselinePath)
    ? { kind: 'changed', text: edited }
    : {
        kind: 'refused',
        reason: `lefthook.yml lists extends in a form chex init does not edit; add ${baselinePath} to its list`,
      };
}

function parseConfig(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;

  try {
    parsed = Bun.YAML.parse(text);
  } catch {
    return undefined;
  }

  if (parsed === null) {
    return {};
  }

  return isRecord(parsed) ? parsed : undefined;
}
