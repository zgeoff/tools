import type { SceneSpec } from '../types.ts';
import { formatAttributeValue } from './serialize-node.ts';
import type { SerializeOptions } from './serialize-node.ts';

const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const COMPONENT_RULES = [
  `svg { font-family: ${FONT_STACK}; }`,
  '.sb-caption { font-size: 20px; font-weight: 700; }',
  '.sb-title { font-size: 11.5px; font-weight: 700; }',
  '.sb-line { font-size: 13px; white-space: pre; }',
  '.sb-caret { font-size: 13.5px; font-weight: 700; }',
  '.sb-status { font-size: 12px; font-weight: 700; }',
  '.sb-stamp { font-size: 10px; font-weight: 800; letter-spacing: .14em; }',
];

// A number on one of these properties is in pixels.
const LENGTH_PROPERTIES = new Set([
  'font-size',
  'letter-spacing',
  'word-spacing',
  'stroke-width',
  'stroke-dashoffset',
  'line-height',
]);

// The file's one style block: the font stack, the classes the components use, and each class of
// the scene's `styles`.
export function buildStyleText(styles: SceneSpec['styles'], options: SerializeOptions): string {
  const sceneRules = Object.entries(styles ?? {}).map(([name, properties]) => {
    const declarations = Object.entries(properties)
      .map(([property, value]) => {
        const text =
          typeof value === 'number' && LENGTH_PROPERTIES.has(property)
            ? `${formatAttributeValue(value, options)}px`
            : formatAttributeValue(value, options);

        return `${property}: ${text};`;
      })
      .join(' ');

    return `.${name} { ${declarations} }`;
  });

  return [...COMPONENT_RULES, ...sceneRules].map((rule) => `    ${rule}`).join('\n');
}
