// oxlint-disable unicorn/no-array-callback-reference -- time.find looks up a reference, and is no iterator method
// oxlint-disable eslint/id-length -- SVG names its attributes d and r with one letter
import { buildAnimation } from '../animation/build-animation.ts';
import { FADE_S } from '../animation/constants.ts';
import { buildAmbient } from '../components/build-ambient.ts';
import { buildElement } from '../jsx/build-element.ts';
import type {
  AnimationNode,
  Delivery,
  SceneTime,
  StoryNode,
  TerminalAlertMail,
  TerminalLineMail,
  TerminalMail,
  TerminalStatusMail,
  TerminalTypeMail,
} from '../types.ts';
import { buildStep } from './build-step.ts';
import { dividerOffset } from './divider-offset.ts';
import { heightOf } from './height-of.ts';
import { renderAlert } from './render-alert.ts';
import { renderFlash } from './render-flash.ts';
import { renderTypedRow } from './render-typed-row.ts';
import { HEADER_H, rowBaseline } from './row-baseline.ts';
import type {
  GrowAnimations,
  TerminalContext,
  TerminalHelpers,
  TerminalLineOption,
  TerminalProps,
} from './types.ts';

// Draws a terminal: its frame, its lines and rows, its status, its veil and its alert borders. The
// frame, the veil and each alert border grow by one row over one fade as a row enters.
export function renderTerminal(
  props: TerminalProps,
  deliveries: readonly Delivery<TerminalMail>[],
  time: SceneTime,
  helpers: TerminalHelpers,
): StoryNode {
  const initialRows = (props.lines ?? []).length;
  const baseRows = Math.max(1, initialRows);
  const rowDeliveries = collectRowDeliveries(deliveries);

  const growth = collectGrowth(
    rowDeliveries.map((row) => row.at),
    initialRows,
  );

  const grow: GrowAnimations = (attribute, offset) => {
    const steps = growth.map((step) =>
      buildStep({
        attribute,
        startS: step.at - FADE_S,
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

  const ctx: TerminalContext = { props, time, helpers, baseRows, initialRows, grow };
  const rows = rowDeliveries.map((row, index) => renderRow(row, initialRows + index, ctx));

  const alerts = collectAlertDeliveries(deliveries).map((alert) =>
    renderAlert(alert.at, alert.mail, ctx),
  );

  const flashes = collectStatusDeliveries(deliveries).flatMap((status) =>
    status.mail.flash ? [renderFlash(status.at, status.mail.tone, ctx)] : [],
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
    flashes,
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

// One step for each instant that rows enter, with the rows the frame shows before and after it. The
// frame always shows at least one row, so the first row to enter an empty terminal needs no growth.
function collectGrowth(rowTimes: readonly number[], initialRows: number): GrowthStep[] {
  const steps: GrowthStep[] = [];
  let rows = initialRows;

  for (const at of rowTimes) {
    const rowsBefore = Math.max(1, rows);

    rows += 1;

    const rowsAfter = Math.max(1, rows);
    const last = steps.at(-1);

    if (last?.at === at) {
      last.rowsAfter = rowsAfter;
    } else {
      steps.push({ at, rowsBefore, rowsAfter });
    }
  }

  return steps.filter((step) => step.rowsAfter > step.rowsBefore);
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

function collectAlertDeliveries(
  deliveries: readonly Delivery<TerminalMail>[],
): { at: number; mail: TerminalAlertMail }[] {
  return deliveries.flatMap((delivery) =>
    delivery.payload.form === 'alert' ? [{ at: delivery.at, mail: delivery.payload }] : [],
  );
}

function collectStatusDeliveries(
  deliveries: readonly Delivery<TerminalMail>[],
): { at: number; mail: TerminalStatusMail }[] {
  return deliveries.flatMap((delivery) =>
    delivery.payload.form === 'status' ? [{ at: delivery.at, mail: delivery.payload }] : [],
  );
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

  const dots = [
    { offset: 15, tone: 'windowClose' },
    { offset: 24, tone: 'windowMinimize' },
    { offset: 33, tone: 'windowZoom' },
  ].map((dot) =>
    buildElement(
      'circle',
      { cx: box.x + dot.offset, cy: box.y + 13, r: 2.6, fill: color(dot.tone), opacity: 0.6 },
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
      y1: box.y + HEADER_H,
      x2: box.x + box.width,
      y2: box.y + HEADER_H,
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
  const breathing = buildAmbient({ attribute: 'fill-opacity', periodS: 1.2, values: [1, 0.35, 1] });

  const dot = buildElement(
    'circle',
    { cx: box.x + 17, cy: box.y + dividerOffset(ctx.baseRows) + 13, r: 3.2, fill: tone },
    [ctx.grow('cy', (rows) => box.y + dividerOffset(rows) + 13), breathing],
  );

  const text = buildElement(
    'text',
    {
      x: box.x + 28,
      y: box.y + dividerOffset(ctx.baseRows) + 17.2,
      class: 'sb-status',
      fill: tone,
    },
    [entry.text, ctx.grow('y', (rows) => box.y + dividerOffset(rows) + 17.2)],
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
  const isLitAtStart = ctx.time.acting.some((span) => span.fromS <= 0);

  const spans = ctx.time.acting.flatMap((span) => {
    // The veil lifts ahead of the host acting, so it is clear by the time the host acts.
    const lit = buildStep({
      attribute: 'opacity',
      startS: span.fromS - FADE_S,
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

    const steps = span.fromS <= 0 ? [] : [lit];

    return span.toS < ctx.time.reset ? [...steps, dim] : steps;
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
      opacity: isLitAtStart ? 0 : VEIL_OPACITY,
    },
    [ctx.grow('height', (rows) => heightOf(rows)), spans],
  );
}
