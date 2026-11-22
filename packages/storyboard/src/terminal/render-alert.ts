import { CUT_S } from '../animation/constants.ts';
import type { StoryNode, TerminalAlertMail } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';
import { buildBorderShow } from './build-border-show.ts';
import { renderBorder } from './render-border.ts';
import type { TerminalContext } from './types.ts';

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

  const shows = buildBorderShow({ at, totalS, resetS: ctx.time.reset, keys });

  return renderBorder(ctx, ctx.helpers.color(mail.tone), [shows]);
}
