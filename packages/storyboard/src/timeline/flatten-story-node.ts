import type { StoryElement, StoryNode } from '../types.ts';

// The nodes that a child list holds, with arrays opened and nodes that draw nothing left out.
export function flattenStoryNode(node: StoryNode): StoryElement[] {
  if (isNodeList(node)) {
    return node.flatMap((child: StoryNode) => flattenStoryNode(child));
  }

  if (typeof node === 'object' && node !== null && 'node' in node) {
    return [node];
  }

  return [];
}

export function isNodeList(node: StoryNode): node is readonly StoryNode[] {
  return Array.isArray(node);
}
