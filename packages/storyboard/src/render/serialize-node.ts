import type { AttributeValue, ElementNode, TokenValue } from '../types.ts';
import { formatNumber } from '../utils/format-number.ts';
import { SceneError } from '../utils/scene-error.ts';

export type Mode = 'dark' | 'light';

export interface SerializeOptions {
  readonly mode: Mode;
  readonly sceneName: string;
}

export function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeAttribute(text: string): string {
  return escapeText(text).replaceAll('"', '&quot;');
}

export function formatTokenValue(value: TokenValue, mode: Mode): string {
  return typeof value === 'string' ? value : value[mode];
}

export function formatAttributeValue(value: AttributeValue, options: SerializeOptions): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return formatNumber(value);
  }

  if (value.node === 'id') {
    const id = `${options.sceneName}-${value.name}`;

    return value.asURL ? `url(#${id})` : id;
  }

  const token = value.values[value.name];

  if (token === undefined) {
    throw new SceneError('bad-scene', `the token "${value.name}" is not defined`);
  }

  return formatTokenValue(token, options.mode);
}

// Writes the element as a string. Only the root's own children and the defs go on lines of their
// own, which keeps a file readable without the bytes that a full indent would add.
export function serializeNode(
  node: ElementNode | string,
  options: SerializeOptions,
  isLineBroken: boolean,
): string {
  if (typeof node === 'string') {
    return escapeText(node);
  }

  const attributes = Object.entries(node.attributes)
    .flatMap(([name, value]) =>
      value === undefined
        ? []
        : [` ${name}="${escapeAttribute(formatAttributeValue(value, options))}"`],
    )
    .join('');

  const children = node.children.flatMap((child) => (isNodeOrText(child) ? [child] : []));

  if (children.length === 0) {
    return `<${node.tag}${attributes}/>`;
  }

  const inner = children
    .map((child) => `${isLineBroken ? '\n  ' : ''}${serializeNode(child, options, false)}`)
    .join('');

  return `<${node.tag}${attributes}>${inner}${isLineBroken ? '\n' : ''}</${node.tag}>`;
}

function isNodeOrText(child: unknown): child is ElementNode | string {
  return (
    typeof child === 'string' || (typeof child === 'object' && child !== null && 'tag' in child)
  );
}
