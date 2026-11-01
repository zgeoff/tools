import { parseLefthookConfig } from './parse-lefthook-config.ts';

export const baselinePath = 'node_modules/@zgeoff/chex/lefthook.yml';

export type LefthookOutcome =
  | { readonly kind: 'unchanged'; readonly text: string }
  | { readonly kind: 'changed'; readonly text: string }
  | { readonly kind: 'refused'; readonly reason: string };

const extendsLine = /^extends:[ \t]*(?:#.*)?$/mu;

// A one-line flow list, such as `extends: [.lefthook/local.yml]`, with an optional comment after it.
const inlineExtends = /^(?<open>extends:[ \t]*\[)(?<items>[^\]\n]*)(?<close>\][ \t]*(?:#.*)?)$/mu;

// Edits the text rather than writing parsed YAML back, so the repo's comments and layout stay.
export function buildLefthookExtends(text: string | undefined): LefthookOutcome {
  if (text === undefined) {
    return { kind: 'changed', text: `extends:\n  - ${baselinePath}\n` };
  }

  const config = parseLefthookConfig(text);

  if (config === undefined) {
    return { kind: 'refused', reason: 'lefthook.yml is not a YAML mapping' };
  }

  const extended = config['extends'];

  if (extended === undefined) {
    return checkEdit(config, buildFirstExtends(text));
  }

  if (Array.isArray(extended) && extended.includes(baselinePath)) {
    return { kind: 'unchanged', text };
  }

  const inline = inlineExtends.exec(text);

  if (Array.isArray(extended) && inline !== null) {
    return checkEdit(config, buildInlineExtends(text, inline));
  }

  const match = extendsLine.exec(text);

  if (!Array.isArray(extended) || match === null) {
    return {
      kind: 'refused',
      reason: `lefthook.yml writes extends in a form chex init does not edit; add ${baselinePath} to its list`,
    };
  }

  const end = match.index + match[0].length;

  return checkEdit(config, `${text.slice(0, end)}\n  - ${baselinePath}${text.slice(end)}`);
}

// A flow mapping or a second YAML document reads differently once a block key joins the text.
function checkEdit(config: Record<string, unknown>, edited: string): LefthookOutcome {
  const editedConfig = parseLefthookConfig(edited);

  if (editedConfig !== undefined) {
    const { extends: editedExtends, ...editedRest } = editedConfig;
    const { extends: _, ...rest } = config;

    if (
      Array.isArray(editedExtends) &&
      editedExtends.includes(baselinePath) &&
      Bun.deepEquals(editedRest, rest, true)
    ) {
      return { kind: 'changed', text: edited };
    }
  }

  return {
    kind: 'refused',
    reason: `lefthook.yml is laid out in a form chex init does not edit; add an extends list that names ${baselinePath}`,
  };
}

const documentStart = /^(?:[ \t]*(?:#.*)?\n)*---[ \t]*(?:#.*)?(?=\n|$)/u;

function buildFirstExtends(text: string): string {
  const start = documentStart.exec(text);

  if (start === null) {
    return `extends:\n  - ${baselinePath}\n\n${text}`;
  }

  const end = start[0].length;

  return `${text.slice(0, end)}\nextends:\n  - ${baselinePath}\n${text.slice(end)}`;
}

function buildInlineExtends(text: string, inline: RegExpExecArray): string {
  const groups = inline.groups ?? {};
  const items = groups['items'] ?? '';
  const listed = items.trim() === '' ? baselinePath : `${items.trimEnd()}, ${baselinePath}`;
  const end = inline.index + inline[0].length;

  return `${text.slice(0, inline.index)}${groups['open'] ?? ''}${listed}${groups['close'] ?? ''}${text.slice(end)}`;
}
