import { buildAnimation } from '../animation/build-animation.ts';
import { CUT_S, FADE_S } from '../animation/constants.ts';
import { buildAmbient } from '../components/build-ambient.ts';
import { buildElement } from '../jsx/build-element.ts';
import type { AnimationNode, StoryNode, TerminalAlertMail, TokenReference } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';
import { heightOf } from './height-of.ts';
import type { TerminalContext } from './terminal-context.ts';

export function renderAlert(at: number, mail: TerminalAlertMail, ctx: TerminalContext): StoryNode {
  const spanS = ctx.time.find(mail.until) - at;

  if (!(spanS > 0)) {
    throw new SceneError(
      'bad-component',
      `an <Alert> ends at ${mail.until}, which is not after it starts`,
    );
  }

  // The border cuts in, holds, and cuts out as the alert ends, pulsing while it shows.
  const totalS = spanS + CUT_S;

  const keys: (readonly [number, number])[] = [
    [0, 0],
    [CUT_S / totalS, 1],
    [spanS / totalS, 1],
    [1, 0],
  ];

  const shows = buildAnimation({ attribute: 'opacity', startS: at, durS: totalS, keys });

  return renderBorder(ctx, ctx.helpers.color(mail.tone), [shows]);
}

const BORDER_WIDTH = 1.8;
const FLASH_FADES = 3;

// A status that confirms something flashes the frame once and lets the border fade over a few fades.
export function renderFlash(at: number, tone: string | undefined, ctx: TerminalContext): StoryNode {
  const totalS = CUT_S + FLASH_FADES * FADE_S;

  const keys: (readonly [number, number])[] = [
    [0, 0],
    [CUT_S / totalS, 1],
    [1, 0],
  ];

  const shows = buildAnimation({ attribute: 'opacity', startS: at, durS: totalS, keys });

  return renderBorder(ctx, ctx.helpers.color(tone ?? 'green'), [shows]);
}

function renderBorder(
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
