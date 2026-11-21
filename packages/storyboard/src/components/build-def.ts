import type { DefNode, DefProps } from '../types.ts';

export function buildDef(props: DefProps): DefNode {
  return { node: 'def', children: props.children };
}
