import { CUT_S, FADE_S } from '../animation/constants.ts';
import type { StoryNode } from '../types.ts';
import { buildBorderShow } from './build-border-show.ts';
import { renderBorder } from './render-border.ts';
import type { TerminalContext } from './types.ts';

const FLASH_FADES = 3;

// A status that confirms something flashes the frame once and lets the border fade over a few fades.
export function renderFlash(at: number, tone: string | undefined, ctx: TerminalContext): StoryNode {
  const totalS = CUT_S + FLASH_FADES * FADE_S;

  const shows = buildBorderShow({
    at,
    totalS,
    resetS: ctx.time.reset,
    keys: [
      [0, 0],
      [CUT_S / totalS, 1],
      [1, 0],
    ],
  });

  return renderBorder(ctx, ctx.helpers.color(tone ?? 'green'), [shows]);
}
