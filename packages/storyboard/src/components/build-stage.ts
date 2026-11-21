import type { StageNode, StageProps, TokenValue } from '../types.ts';

export function buildStage(
  tokens: Readonly<Record<string, TokenValue>>,
  props: StageProps,
): StageNode {
  return { node: 'stage', caption: props.caption, tokens, children: props.children };
}
