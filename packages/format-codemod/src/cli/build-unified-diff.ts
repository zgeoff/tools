/**
 * A real unified diff — @@ hunk headers with context — so --dry output can be
 * applied with patch(1). Inputs are expected to end with a newline, which
 * TypeScript sources do and the transform preserves.
 */
export function buildUnifiedDiff(before: string, after: string, label: string): string {
  const ops = new MyersDiff(splitLines(before), splitLines(after)).buildOps();
  const hunks = buildHunks(ops);

  if (hunks.length === 0) {
    return '';
  }

  return [`--- ${label}\n`, `+++ ${label}\n`, ...hunks.map((h) => renderHunk(h))].join('');
}

function splitLines(s: string): string[] {
  const lines = s.split('\n');

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

interface DiffOp {
  readonly kind: ' ' | '-' | '+';
  readonly text: string;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

/**
 * Myers O((N+M)·D) line diff. D is the edit distance — for padding diffs just
 * the handful of inserted blanks — so this stays near-linear, and unlike the
 * old greedy resync it can't mis-pair repeated lines.
 */
class MyersDiff {
  private readonly a: readonly string[];

  private readonly b: readonly string[];

  private readonly v = new Map<number, number>([[1, 0]]);

  private readonly trace: Map<number, number>[] = [];

  constructor(a: readonly string[], b: readonly string[]) {
    this.a = a;
    this.b = b;
  }

  buildOps(): DiffOp[] {
    this.computeTrace();

    return this.backtrack();
  }

  /**
   * One snapshot of v per edit-distance round; the round that reaches the end
   * stops the search and the snapshots drive the backtrack.
   */
  private computeTrace(): void {
    for (let d = 0; d <= this.a.length + this.b.length; d++) {
      this.trace.push(new Map(this.v));

      if (this.stepRound(d)) {
        return;
      }
    }
  }

  private stepRound(d: number): boolean {
    for (let k = -d; k <= d; k += 2) {
      const x = this.slideDiagonal(this.pickX(k, d), k);

      this.v.set(k, x);

      if (x >= this.a.length && x - k >= this.b.length) {
        return true;
      }
    }

    return false;
  }

  private pickX(k: number, d: number): number {
    const moveDown = k === -d || (k !== d && (this.v.get(k - 1) ?? 0) < (this.v.get(k + 1) ?? 0));

    return moveDown ? (this.v.get(k + 1) ?? 0) : (this.v.get(k - 1) ?? 0) + 1;
  }

  private slideDiagonal(x: number, k: number): number {
    let nx = x;

    while (nx < this.a.length && nx - k < this.b.length && this.a[nx] === this.b[nx - k]) {
      nx++;
    }

    return nx;
  }

  private backtrack(): DiffOp[] {
    const ops: DiffOp[] = [];
    let pos: Position = { x: this.a.length, y: this.b.length };

    for (let d = this.trace.length - 1; d >= 0; d--) {
      const round = this.unwindRound(pos, d);

      ops.push(...round.ops);
      pos = round.pos;
    }

    return ops.toReversed();
  }

  private unwindRound(pos: Position, d: number): { ops: DiffOp[]; pos: Position } {
    const { prev, moveDown } = this.findPrevious(pos, d);
    const ops = this.buildEqualOps(pos, prev);

    if (d > 0) {
      ops.push(
        moveDown
          ? { kind: '+', text: this.b[prev.y] ?? '' }
          : { kind: '-', text: this.a[prev.x] ?? '' },
      );
    }

    return { ops, pos: prev };
  }

  private findPrevious(pos: Position, d: number): { prev: Position; moveDown: boolean } {
    const v = this.trace[d] ?? new Map<number, number>();
    const k = pos.x - pos.y;
    const moveDown = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0));
    const prevK = moveDown ? k + 1 : k - 1;
    const prevX = v.get(prevK) ?? 0;

    return { prev: { x: prevX, y: prevX - prevK }, moveDown };
  }

  /**
   * The diagonal walk back from pos to prev — the lines both sides share.
   */
  private buildEqualOps(pos: Position, prev: Position): DiffOp[] {
    const ops: DiffOp[] = [];
    let { x, y } = pos;

    while (x > prev.x && y > prev.y) {
      ops.push({ kind: ' ', text: this.a[x - 1] ?? '' });
      x--;
      y--;
    }

    return ops;
  }
}

interface Window {
  readonly from: number;
  readonly to: number;
}

interface Hunk {
  readonly header: string;
  readonly lines: readonly string[];
}

function buildHunks(ops: readonly DiffOp[]): Hunk[] {
  return buildWindows(ops).map((w) => buildHunk(ops, w));
}

/**
 * Each changed op pulls CONTEXT_LINES of surrounding ops into its window;
 * overlapping or adjacent windows merge into one hunk.
 */
function buildWindows(ops: readonly DiffOp[]): Window[] {
  const windows: Window[] = [];

  for (let i = 0; i < ops.length; i++) {
    if (ops[i]?.kind !== ' ') {
      const from = Math.max(0, i - CONTEXT_LINES);
      const to = Math.min(ops.length, i + CONTEXT_LINES + 1);
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

function buildHunk(ops: readonly DiffOp[], w: Window): Hunk {
  const { aLine, bLine } = countPrecedingLines(ops, w.from);
  const slice = ops.slice(w.from, w.to);
  const aCount = slice.filter((o) => o.kind !== '+').length;
  const bCount = slice.filter((o) => o.kind !== '-').length;

  return {
    header: `@@ -${formatRange(aLine, aCount)} +${formatRange(bLine, bCount)} @@\n`,
    lines: slice.map((o) => `${o.kind}${o.text}\n`),
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

/**
 * An empty range anchors to the line before it (already correct 0-based);
 * a populated one is 1-based.
 */
function formatRange(line: number, count: number): string {
  return count === 0 ? `${line},0` : `${line + 1},${count}`;
}

function renderHunk(h: Hunk): string {
  return `${h.header}${h.lines.join('')}`;
}

/**
 * Context lines per hunk, matching diff -u / git defaults.
 */
const CONTEXT_LINES = 3;
