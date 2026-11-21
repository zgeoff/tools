// oxlint-disable unicorn/no-array-callback-reference -- time.find looks up a reference, and is no iterator method
// oxlint-disable eslint/id-length -- SVG names its attributes d and r with one letter
import { buildAnimation } from '../animation/build-animation.ts';
import { FADE_S } from '../animation/constants.ts';
import { buildAmbient } from '../components/build-ambient.ts';
import { buildDef } from '../components/build-def.ts';
import { buildElement } from '../jsx/build-element.ts';
import type {
  AnimationNode,
  Delivery,
  IDReference,
  SceneTime,
  StoryNode,
  TerminalAlertMail,
  TerminalLineMail,
  TerminalMail,
  TerminalTypeMail,
  TokenReference,
} from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';
import { buildStep } from './build-step.ts';

export interface TerminalLineOption {
  readonly text: string;
  readonly tone?: string | undefined;
}

export interface TerminalProps {
  readonly title: string;
  readonly box: { readonly x: number; readonly y: number; readonly width: number };
  readonly opens?: string | undefined;
  readonly status?: string | TerminalLineOption | undefined;
  readonly lines?: readonly (string | TerminalLineOption)[] | undefined;
}

export interface TerminalHelpers {
  readonly color: (name: string) => TokenReference;
  readonly id: (name: string) => IDReference;
  readonly url: (name: string) => IDReference;
}

type GrowAnimations = (attribute: string, offset: (rows: number) => number) => AnimationNode[];

interface TerminalContext {
  readonly props: TerminalProps;
  readonly time: SceneTime;
  readonly helpers: TerminalHelpers;
  readonly baseRows: number;
  readonly grow: GrowAnimations;
}

// Draws a terminal: its frame, its lines and rows, its status, its veil and its alert borders. The
// frame, the veil and each alert border grow by one row over one fade as a row enters.
export function renderTerminal(
  props: TerminalProps,
  deliveries: readonly Delivery<TerminalMail>[],
  time: SceneTime,
  helpers: TerminalHelpers,
): StoryNode {
  const baseRows = (props.lines ?? []).length;
  const rowDeliveries = collectRowDeliveries(deliveries);

  const growth = collectGrowth(
    rowDeliveries.map((row) => row.at),
    baseRows,
  );

  const grow: GrowAnimations = (attribute, offset) => {
    const steps = growth.map((step) =>
      buildStep({
        attribute,
        startS: step.at,
        durS: FADE_S,
        from: offset(step.rowsBefore),
        to: offset(step.rowsAfter),
      }),
    );

    const total = growth.at(-1)?.rowsAfter;

    if (total === undefined) {
      return [];
    }

    const shrink = buildStep({
      attribute,
      startS: time.reset + FADE_S,
      durS: FADE_S,
      from: offset(total),
      to: offset(baseRows),
      isInternal: true,
    });

    return [...steps, shrink];
  };

  const ctx: TerminalContext = { props, time, helpers, baseRows, grow };
  const rows = rowDeliveries.map((row, index) => renderRow(row, baseRows + index, ctx));

  const alerts = collectAlertDeliveries(deliveries).map((alert) =>
    renderAlert(alert.at, alert.mail, ctx),
  );

  const body = [
    renderFrame(ctx),
    renderHeader(ctx),
    renderInitialLines(ctx),
    rows,
    renderStatusDivider(ctx),
    renderStatuses(deliveries, ctx),
    renderVeil(ctx),
    alerts,
  ];

  if (props.opens === undefined) {
    return buildElement('g', {}, body);
  }

  const opening = time.fadeIn(time.find(props.opens));

  return buildElement('g', { opacity: 0 }, [...body, opening]);
}

interface RowDelivery {
  readonly at: number;
  readonly mail: TerminalLineMail | TerminalTypeMail;
}

function collectRowDeliveries(deliveries: readonly Delivery<TerminalMail>[]): RowDelivery[] {
  return deliveries.flatMap((delivery) =>
    delivery.payload.form === 'line' || delivery.payload.form === 'type'
      ? [{ at: delivery.at, mail: delivery.payload }]
      : [],
  );
}

interface GrowthStep {
  readonly at: number;
  readonly rowsBefore: number;
  rowsAfter: number;
}

// One step for each instant that rows enter, with the rows before and after it.
function collectGrowth(rowTimes: readonly number[], baseRows: number): GrowthStep[] {
  const steps: GrowthStep[] = [];
  let rows = baseRows;

  for (const at of rowTimes) {
    const last = steps.at(-1);

    if (last?.at === at) {
      last.rowsAfter += 1;
    } else {
      steps.push({ at, rowsBefore: rows, rowsAfter: rows + 1 });
    }

    rows += 1;
  }

  return steps;
}

function renderRow(row: RowDelivery, index: number, ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;

  if (row.mail.form === 'type') {
    return renderTypedRow(row.at, row.mail, { x: box.x + 14, y: box.y + rowBaseline(index) }, ctx);
  }

  const fades = [ctx.time.fadeIn(row.at), ctx.time.fadeOut(ctx.time.reset)];

  const slide = buildAnimation({
    attribute: 'transform',
    transform: 'translate',
    startS: row.at,
    durS: FADE_S,
    keys: [
      [0, '-6 0'],
      [1, '0 0'],
    ],
  });

  const head = buildElement('tspan', {}, row.mail.head);
  const text = buildElement('tspan', { 'font-style': 'italic' }, row.mail.text);
  const content = row.mail.head === '' ? row.mail.text : [head, text];

  const line = buildElement(
    'text',
    {
      x: box.x + 14,
      y: box.y + rowBaseline(index),
      class: 'sb-line',
      fill: ctx.helpers.color(row.mail.tone ?? 'text'),
    },
    [content, slide],
  );

  return buildElement('g', { opacity: 0 }, [line, fades]);
}

const ROW_H = 19;

interface RowOrigin {
  readonly x: number;
  readonly y: number;
}

function renderTypedRow(
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
  const textX = origin.x + 2 * charWidth;

  const reveal = buildStep({
    attribute: 'width',
    startS: at,
    durS: Math.max(mail.typingS, 0.03),
    from: 0,
    to: mail.text.length * charWidth,
  });

  const dim = buildStep({
    attribute: 'opacity',
    startS: at + mail.sendsS,
    durS: FADE_S,
    from: 1,
    to: 0.7,
  });

  const clipRect = buildElement(
    'rect',
    { x: textX, y: origin.y - 13, height: ROW_H, width: 0 },
    reveal,
  );

  const clip = buildDef({
    children: buildElement('clipPath', { id: ctx.helpers.id(clipID) }, clipRect),
  });

  const caret = buildElement(
    'text',
    { x: origin.x, y: origin.y, class: 'sb-line', fill: color('blue') },
    '›',
  );

  const typed = buildElement(
    'text',
    {
      x: textX,
      y: origin.y,
      class: 'sb-line',
      fill: color('text'),
      opacity: 1,
      'clip-path': ctx.helpers.url(clipID),
    },
    [mail.text, dim],
  );

  const fades = [ctx.time.fadeIn(at), ctx.time.fadeOut(ctx.time.reset)];

  return buildElement('g', { opacity: 0 }, [clip, caret, typed, fades]);
}

const HEADER_H = 26;

function rowBaseline(index: number): number {
  const padding = 8;
  const ascent = 13;

  return HEADER_H + padding + ROW_H * index + ascent;
}

function collectAlertDeliveries(
  deliveries: readonly Delivery<TerminalMail>[],
): { at: number; mail: TerminalAlertMail }[] {
  return deliveries.flatMap((delivery) =>
    delivery.payload.form === 'alert' ? [{ at: delivery.at, mail: delivery.payload }] : [],
  );
}

function renderAlert(at: number, mail: TerminalAlertMail, ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;
  const spanS = ctx.time.find(mail.until) - at;

  if (!(spanS > 0)) {
    throw new SceneError(
      'bad-component',
      `an <Alert> ends at ${mail.until}, which is not after it starts`,
    );
  }

  const cycles = Math.max(2, Math.round(spanS / 0.5));
  const keys: (readonly [number, number])[] = [[0, 0]];

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    keys.push([cycle / (cycles + 1), cycle % 2 === 1 ? 1 : 0.35]);
  }

  keys.push([1, 0]);

  const flash = buildAnimation({ attribute: 'opacity', startS: at, durS: spanS, keys });

  return buildElement(
    'rect',
    {
      x: box.x,
      y: box.y,
      width: box.width,
      height: heightOf(ctx.baseRows),
      rx: 10,
      fill: 'none',
      stroke: ctx.helpers.color(mail.tone),
      'stroke-width': 1.6,
      opacity: 0,
    },
    [ctx.grow('height', (rows) => heightOf(rows)), flash],
  );
}

const STATUS_H = 26;

function heightOf(rows: number): number {
  return dividerOffset(rows) + STATUS_H;
}

function dividerOffset(rows: number): number {
  const padding = 8;

  return HEADER_H + padding + ROW_H * rows;
}

function renderFrame(ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;
  const color = ctx.helpers.color;

  return buildElement(
    'rect',
    {
      x: box.x,
      y: box.y,
      width: box.width,
      height: heightOf(ctx.baseRows),
      rx: 10,
      fill: color('terminalFill'),
      'fill-opacity': 0.94,
      stroke: color('terminalStroke'),
      'stroke-opacity': 0.12,
    },
    ctx.grow('height', (rows) => heightOf(rows)),
  );
}

function renderHeader(ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;
  const color = ctx.helpers.color;

  const dots = [15, 24, 33].map((offset) =>
    buildElement(
      'circle',
      { cx: box.x + offset, cy: box.y + 13, r: 2.6, fill: color('dimText'), 'fill-opacity': 0.6 },
      null,
    ),
  );

  const title = buildElement(
    'text',
    {
      x: box.x + box.width - 12,
      y: box.y + 16.5,
      class: 'sb-title',
      'text-anchor': 'end',
      fill: color('dimText'),
    },
    ctx.props.title,
  );

  const divider = buildElement(
    'line',
    {
      x1: box.x,
      y1: box.y + HEADER_H - 1,
      x2: box.x + box.width,
      y2: box.y + HEADER_H - 1,
      stroke: color('terminalStroke'),
      'stroke-opacity': 0.08,
    },
    null,
  );

  return [dots, title, divider];
}

function renderInitialLines(ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;

  return (ctx.props.lines ?? []).map((option, index) => {
    const line = toLineOption(option);

    return buildElement(
      'text',
      {
        x: box.x + 14,
        y: box.y + rowBaseline(index),
        class: 'sb-line',
        fill: ctx.helpers.color(line.tone ?? 'text'),
      },
      line.text,
    );
  });
}

function toLineOption(line: string | TerminalLineOption): TerminalLineOption {
  return typeof line === 'string' ? { text: line } : line;
}

function renderStatusDivider(ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;
  const dividerY = box.y + dividerOffset(ctx.baseRows);
  const offset = (rows: number): number => box.y + dividerOffset(rows);

  return buildElement(
    'line',
    {
      x1: box.x,
      y1: dividerY,
      x2: box.x + box.width,
      y2: dividerY,
      stroke: ctx.helpers.color('terminalStroke'),
      'stroke-opacity': 0.08,
    },
    [ctx.grow('y1', offset), ctx.grow('y2', offset)],
  );
}

interface StatusEntry {
  readonly at: number | undefined;
  readonly text: string;
  readonly tone: string | undefined;
}

function renderStatuses(
  deliveries: readonly Delivery<TerminalMail>[],
  ctx: TerminalContext,
): StoryNode {
  const first = toLineOption(ctx.props.status ?? '');
  const entries: StatusEntry[] = [{ at: undefined, text: first.text, tone: first.tone }];

  for (const delivery of deliveries) {
    if (delivery.payload.form === 'status') {
      entries.push({ at: delivery.at, text: delivery.payload.text, tone: delivery.payload.tone });
    }
  }

  return entries.map((entry, index) => renderStatus(entry, entries[index + 1], ctx));
}

function renderStatus(
  entry: StatusEntry,
  next: StatusEntry | undefined,
  ctx: TerminalContext,
): StoryNode {
  const box = ctx.props.box;
  const tone = ctx.helpers.color(entry.tone ?? 'dimText');
  const breathing = buildAmbient({ attribute: 'r', periodS: 2.4, values: [3.2, 3.8, 3.2] });

  const dot = buildElement(
    'circle',
    { cx: box.x + 15, cy: box.y + dividerOffset(ctx.baseRows) + 13, r: 3.2, fill: tone },
    [ctx.grow('cy', (rows) => box.y + dividerOffset(rows) + 13), breathing],
  );

  const text = buildElement(
    'text',
    {
      x: box.x + 26,
      y: box.y + dividerOffset(ctx.baseRows) + 17,
      class: 'sb-status',
      fill: tone,
    },
    [entry.text, ctx.grow('y', (rows) => box.y + dividerOffset(rows) + 17)],
  );

  const fades = collectStatusFades(entry, next, ctx.time);

  return buildElement('g', { opacity: entry.at === undefined ? 1 : 0 }, [dot, text, fades]);
}

function collectStatusFades(
  entry: StatusEntry,
  next: StatusEntry | undefined,
  time: SceneTime,
): AnimationNode[] {
  const fades: AnimationNode[] = [];

  if (entry.at !== undefined) {
    fades.push(buildSwapIn(entry.at, time));
  }

  if (next?.at !== undefined) {
    fades.push(buildSwapOut(next.at, time));
  } else if (entry.at !== undefined) {
    fades.push(buildSwapOut(time.reset, time));
  }

  if (entry.at === undefined && next !== undefined) {
    fades.push(buildSwapIn(time.reset, time));
  }

  return fades;
}

function buildSwapIn(atS: number, time: SceneTime): AnimationNode {
  return buildStep({
    attribute: 'opacity',
    startS: atS + 0.14,
    durS: 0.21,
    from: 0,
    to: 1,
    isInternal: atS >= time.reset,
  });
}

// A status is swapped for the next one without the two showing at once, so no two texts overlap.
function buildSwapOut(atS: number, time: SceneTime): AnimationNode {
  return buildStep({
    attribute: 'opacity',
    startS: atS,
    durS: 0.175,
    from: 1,
    to: 0,
    isInternal: atS >= time.reset,
  });
}

const VEIL_OPACITY = 0.6;

function renderVeil(ctx: TerminalContext): StoryNode {
  const box = ctx.props.box;

  const spans = ctx.time.acting.flatMap((span) => {
    const lit = buildStep({
      attribute: 'opacity',
      startS: span.fromS,
      durS: FADE_S,
      from: VEIL_OPACITY,
      to: 0,
    });

    const dim = buildStep({
      attribute: 'opacity',
      startS: span.toS,
      durS: FADE_S,
      from: 0,
      to: VEIL_OPACITY,
    });

    return span.toS < ctx.time.reset ? [lit, dim] : [lit];
  });

  return buildElement(
    'rect',
    {
      x: box.x,
      y: box.y,
      width: box.width,
      height: heightOf(ctx.baseRows),
      rx: 10,
      fill: ctx.helpers.color('veil'),
      opacity: VEIL_OPACITY,
    },
    [ctx.grow('height', (rows) => heightOf(rows)), spans],
  );
}
