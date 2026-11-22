import { buildAnimation } from '../animation/build-animation.ts';
import { CUT_S, FADE_S } from '../animation/constants.ts';
import { buildDef } from '../components/build-def.ts';
import { buildElement } from '../jsx/build-element.ts';
import type { AnimationNode, StoryNode, TerminalTypeMail } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';
import { buildStep } from './build-step.ts';
import { ROW_H } from './row-baseline.ts';
import type { TerminalContext } from './terminal-context.ts';

export interface RowOrigin {
  readonly x: number;
  readonly y: number;
}

export function renderTypedRow(
  at: number,
  mail: TerminalTypeMail,
  origin: RowOrigin,
  ctx: TerminalContext,
): StoryNode {
  const charWidth = 7.8;
  const color = ctx.helpers.color;

  if (mail.sendsS < mail.typingS) {
    throw new SceneError('bad-component', `<Type> "${mail.text}" is sent before it is typed`);
  }

  const clipID = `${ctx.time.key}-clip${Math.round(origin.y)}`;
  const textX = origin.x + 13;
  const typedWidth = mail.text.length * charWidth + 2;

  const reveal = buildStep({
    attribute: 'width',
    startS: at,
    durS: Math.max(mail.typingS, 0.03),
    from: 0,
    to: typedWidth,
  });

  const clipRect = buildElement(
    'rect',
    { x: textX - 1, y: origin.y - 15, height: 21, width: 0 },
    reveal,
  );

  const clip = buildDef({
    children: buildElement('clipPath', { id: ctx.helpers.id(clipID) }, clipRect),
  });

  // The prompt mark is part of the terminal, so it stays through the loop.
  const caret = buildElement(
    'text',
    { x: origin.x, y: origin.y, class: 'sb-caret', fill: color('blue') },
    '›',
  );

  const typed = buildElement(
    'text',
    {
      x: textX,
      y: origin.y,
      class: 'sb-line',
      fill: color('text'),
      opacity: 0,
      'clip-path': ctx.helpers.url(clipID),
    },
    [mail.text, renderTypedShow(at), ctx.time.fadeOut(ctx.time.reset)],
  );

  return buildElement('g', {}, [
    clip,
    caret,
    typed,
    renderCursor(at, mail, { x: textX + typedWidth, y: origin.y }, ctx),
    renderSent(at + mail.sendsS, origin, ctx),
  ]);
}

// The text cuts in as the typing starts.
function renderTypedShow(at: number): AnimationNode {
  return buildStep({ attribute: 'opacity', startS: at, durS: CUT_S, from: 0, to: 1 });
}

const CURSOR_W = 7;
const CURSOR_H = 14;

// The block that shows from the end of the typing until the line is sent.
function renderCursor(
  at: number,
  mail: TerminalTypeMail,
  origin: RowOrigin,
  ctx: TerminalContext,
): StoryNode {
  const spanS = Math.max(mail.sendsS - mail.typingS, 2 * CUT_S);

  const shows = buildAnimation({
    attribute: 'opacity',
    startS: at + mail.typingS,
    durS: spanS,
    keys: [
      [0, 0],
      [CUT_S / spanS, 1],
      [1 - CUT_S / spanS, 1],
      [1, 0],
    ],
  });

  return buildElement(
    'rect',
    {
      x: origin.x,
      y: origin.y - 11,
      width: CURSOR_W,
      height: CURSOR_H,
      fill: ctx.helpers.color('blue'),
      opacity: 0,
    },
    shows,
  );
}

const SENT_PEAK = 0.18;
const SENT_REST = 0.06;

// The row's highlight: it lights as the line is sent, settles, and goes with the reset fade.
function renderSent(sentS: number, origin: RowOrigin, ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;
  const spanS = CUT_S + FADE_S;

  const lights = buildAnimation({
    attribute: 'opacity',
    startS: sentS,
    durS: spanS,
    keys: [
      [0, 0],
      [CUT_S / spanS, SENT_PEAK],
      [1, SENT_REST],
    ],
  });

  const goes = buildStep({
    attribute: 'opacity',
    startS: ctx.time.reset,
    durS: FADE_S,
    from: SENT_REST,
    to: 0,
  });

  return buildElement(
    'rect',
    {
      x: box.x + 8,
      y: origin.y - 14,
      width: box.width - 16,
      height: ROW_H,
      rx: 3,
      fill: ctx.helpers.color('blue'),
      opacity: 0,
    },
    [lights, goes],
  );
}
