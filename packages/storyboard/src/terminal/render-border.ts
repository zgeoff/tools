import { buildAmbient } from '../components/build-ambient.ts';
import { buildElement } from '../jsx/build-element.ts';
import type { AnimationNode, StoryNode, TokenReference } from '../types.ts';
import { heightOf } from './height-of.ts';
import type { TerminalContext } from './types.ts';

const BORDER_WIDTH = 1.8;

// A pulsing border round the frame, shown by the animations it is given.
export function renderBorder(
  ctx: TerminalContext,
  stroke: TokenReference,
  shows: readonly AnimationNode[],
): StoryNode {
  const box = ctx.props.box;
  const pulse = buildAmbient({ attribute: 'stroke-opacity', periodS: 1, values: [1, 0.4, 1] });

  return buildElement(
    'rect',
    {
      x: box.x,
      y: box.y,
      width: box.width,
      height: heightOf(ctx.baseRows),
      rx: 10,
      fill: 'none',
      stroke,
      'stroke-width': BORDER_WIDTH,
      opacity: 0,
    },
    [ctx.grow('height', (rows) => heightOf(rows)), shows, pulse],
  );
}
