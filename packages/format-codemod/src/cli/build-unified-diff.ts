export function buildUnifiedDiff(before: string, after: string, label: string): string {
  const operations = buildDiffOps({ before: splitLines(before), after: splitLines(after) });
  const hunks = buildHunks(operations);

  if (hunks.length === 0) {
    return '';
  }

  return [`--- ${label}\n`, `+++ ${label}\n`, ...hunks.map((hunk) => renderHunk(hunk))].join('');
}

interface DiffOp {
  readonly kind: ' ' | '-' | '+';
  readonly text: string;
}

interface LinePair {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

function buildDiffOps(lines: LinePair): DiffOp[] {
  return backtrack(lines, buildTrace(lines));
}

interface Position {
  readonly x: number;
  readonly y: number;
}

// Myers' diff: each round of edit depth records, per diagonal, the furthest x
// it reaches; the trace of rounds then backtracks into the operations
type FurthestX = Map<number, number>;

function backtrack(lines: LinePair, trace: readonly FurthestX[]): DiffOp[] {
  const operations: DiffOp[] = [];
  let position: Position = { x: lines.before.length, y: lines.after.length };

  for (let depth = trace.length - 1; depth >= 0; depth--) {
    const round = unwindRound(lines, trace, position, depth);

    operations.push(...round.operations);

    position = round.position;
  }

  return operations.toReversed();
}

interface Round {
  readonly operations: DiffOp[];
  readonly position: Position;
}

function unwindRound(
  lines: LinePair,
  trace: readonly FurthestX[],
  position: Position,
  depth: number,
): Round {
  const step = getPreviousStep(trace, position, depth);
  const operations = buildEqualOps(lines, position, step.position);

  if (depth > 0) {
    const changeOp: DiffOp = step.moveDown
      ? { kind: '+', text: lines.after[step.position.y] ?? '' }
      : { kind: '-', text: lines.before[step.position.x] ?? '' };

    operations.push(changeOp);
  }

  return { operations, position: step.position };
}

interface PreviousStep {
  readonly position: Position;
  readonly moveDown: boolean;
}

function getPreviousStep(
  trace: readonly FurthestX[],
  position: Position,
  depth: number,
): PreviousStep {
  const furthestX = trace[depth] ?? new Map<number, number>();
  const diagonal = position.x - position.y;
  const below = furthestX.get(diagonal - 1) ?? 0;
  const above = furthestX.get(diagonal + 1) ?? 0;
  const moveDown = diagonal === -depth || (diagonal !== depth && below < above);
  const previousDiagonal = moveDown ? diagonal + 1 : diagonal - 1;
  const previousX = furthestX.get(previousDiagonal) ?? 0;

  return { position: { x: previousX, y: previousX - previousDiagonal }, moveDown };
}

function buildEqualOps(lines: LinePair, position: Position, previous: Position): DiffOp[] {
  const operations: DiffOp[] = [];
  let x = position.x;
  let y = position.y;

  while (x > previous.x && y > previous.y) {
    operations.push({ kind: ' ', text: lines.before[x - 1] ?? '' });

    x--;
    y--;
  }

  return operations;
}

function buildTrace(lines: LinePair): FurthestX[] {
  const furthestX: FurthestX = new Map([[1, 0]]);

  const trace: FurthestX[] = [];

  for (let depth = 0; depth <= lines.before.length + lines.after.length; depth++) {
    trace.push(new Map(furthestX));

    if (stepRound(lines, furthestX, depth)) {
      break;
    }
  }

  return trace;
}

// oxlint-disable-next-line zgeoff/verb-contract -- Myers-native vocabulary; the flag ends the search
function stepRound(lines: LinePair, furthestX: FurthestX, depth: number): boolean {
  for (let diagonal = -depth; diagonal <= depth; diagonal += 2) {
    const x = slideDiagonal(lines, pickX(furthestX, diagonal, depth), diagonal);

    furthestX.set(diagonal, x);

    if (x >= lines.before.length && x - diagonal >= lines.after.length) {
      return true;
    }
  }

  return false;
}

function slideDiagonal(lines: LinePair, x: number, diagonal: number): number {
  let endX = x;

  while (
    endX < lines.before.length &&
    endX - diagonal < lines.after.length &&
    lines.before[endX] === lines.after[endX - diagonal]
  ) {
    endX++;
  }

  return endX;
}

function pickX(furthestX: FurthestX, diagonal: number, depth: number): number {
  const below = furthestX.get(diagonal - 1) ?? 0;
  const above = furthestX.get(diagonal + 1) ?? 0;
  const moveDown = diagonal === -depth || (diagonal !== depth && below < above);

  return moveDown ? above : below + 1;
}

function splitLines(text: string): string[] {
  const lines = text.split('\n');

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

interface Hunk {
  readonly header: string;
  readonly lines: readonly string[];
}

function buildHunks(ops: readonly DiffOp[]): Hunk[] {
  return buildWindows(ops).map((window) => buildHunk(ops, window));
}

const CONTEXT_LINES = 3;

interface Window {
  readonly from: number;
  readonly to: number;
}

function buildWindows(ops: readonly DiffOp[]): Window[] {
  const windows: Window[] = [];

  for (let index = 0; index < ops.length; index++) {
    if (ops[index]?.kind !== ' ') {
      const from = Math.max(0, index - CONTEXT_LINES);
      const to = Math.min(ops.length, index + CONTEXT_LINES + 1);
      const last = windows.at(-1);

      if (last !== undefined && from <= last.to) {
        windows[windows.length - 1] = { from: last.from, to };
      } else {
        windows.push({ from, to });
      }
    }
  }

  return windows;
}

function buildHunk(ops: readonly DiffOp[], window: Window): Hunk {
  const preceding = countPrecedingLines(ops, window.from);
  const slice = ops.slice(window.from, window.to);
  const aCount = slice.filter((op) => op.kind !== '+').length;
  const bCount = slice.filter((op) => op.kind !== '-').length;

  return {
    header: `@@ -${formatRange(preceding.aLine, aCount)} +${formatRange(preceding.bLine, bCount)} @@\n`,
    lines: slice.map((op) => `${op.kind}${op.text}\n`),
  };
}

function countPrecedingLines(
  ops: readonly DiffOp[],
  from: number,
): { aLine: number; bLine: number } {
  let aLine = 0;
  let bLine = 0;

  for (const op of ops.slice(0, from)) {
    if (op.kind !== '+') {
      aLine++;
    }

    if (op.kind !== '-') {
      bLine++;
    }
  }

  return { aLine, bLine };
}

function formatRange(line: number, count: number): string {
  return count === 0 ? `${line},0` : `${line + 1},${count}`;
}

function renderHunk(hunk: Hunk): string {
  return `${hunk.header}${hunk.lines.join('')}`;
}
