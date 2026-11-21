import type { BeatNode, Host, StoryNode, TimedProps } from '../types.ts';

export function buildBeat(
  props: TimedProps<{ focus?: Host<unknown>; children: StoryNode }>,
): BeatNode {
  return {
    node: 'beat',
    timing: { id: props.id, after: props.after, at: props.at },
    focus: props.focus,
    children: props.children,
  };
}
