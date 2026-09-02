import type { ASTNode, CommentSpan, Edit, SourceFile } from '../types.ts';

export interface GapEditInput {
  readonly file: SourceFile;
  readonly prev: ASTNode;
  readonly next: ASTNode;
  readonly pad: boolean;
}

export function planGapEdit(input: GapEditInput): Edit | null {
  const gap = buildGap(input.file, input.prev, input.next);

  if (!isSafeToResize(gap)) {
    return null;
  }

  return input.pad ? planBlankLineEdit(gap) : planCollapseEdit(gap);
}

interface Gap {
  readonly src: string;
  readonly start: number;
  readonly end: number;
  readonly comments: readonly CommentSpan[];
}

function buildGap(file: SourceFile, prev: ASTNode, next: ASTNode): Gap {
  const start = getNodeEnd(prev);
  const end = getNodeStart(next);
  const comments = file.comments.filter((c) => c.start >= start && c.end <= end);

  return { src: file.src, start, end, comments };
}

function getNodeEnd(n: ASTNode): number {
  if (typeof n.end !== 'number') {
    throw new TypeError('AST node is missing an end position');
  }

  return n.end;
}

function getNodeStart(n: ASTNode): number {
  if (typeof n.start !== 'number') {
    throw new TypeError('AST node is missing a start position');
  }

  return n.start;
}

// same-line statements come from a leading-semicolon ASI guard (`;(expr)`):
// the parser folds that `;` into the prior node, so the gap falls between `;`
// and `(` and a blank-only splice would orphan the `;`
function isSafeToResize(gap: Gap): boolean {
  return isTriviaOnly(gap) && gap.src.slice(gap.start, gap.end).includes('\n');
}

function isTriviaOnly(gap: Gap): boolean {
  let cursor = gap.start;

  for (const c of gap.comments) {
    if (gap.src.slice(cursor, c.start).trim() !== '') {
      return false;
    }

    cursor = c.end;
  }

  return gap.src.slice(cursor, gap.end).trim() === '';
}

function planBlankLineEdit(gap: Gap): Edit | null {
  const effectiveStart = getEffectiveGapStart(gap);
  const leadingComment = gap.comments.find((c) => c.start >= effectiveStart);

  if (leadingComment !== undefined) {
    return planLeadingCommentEdit(gap.src, effectiveStart, leadingComment.start);
  }

  return planWhitespaceGap(gap.src.slice(effectiveStart, gap.end), effectiveStart, gap.end);
}

function getEffectiveGapStart(gap: Gap): number {
  let pos = gap.start;

  for (const c of gap.comments) {
    if (gap.src.slice(pos, c.start).includes('\n')) {
      break;
    }

    pos = c.end;
  }

  return pos;
}

const MIN_NEWLINES = 2;

function planLeadingCommentEdit(src: string, restStart: number, commentStart: number): Edit | null {
  const leading = src.slice(restStart, commentStart);
  const leadingNewlines = countNewlines(leading);

  if (leadingNewlines >= MIN_NEWLINES) {
    return null;
  }

  return {
    start: restStart,
    end: commentStart,
    replacement: `${'\n'.repeat(MIN_NEWLINES - leadingNewlines)}${leading}`,
  };
}

function planWhitespaceGap(gap: string, gapStart: number, gapEnd: number): Edit | null {
  if (countNewlines(gap) >= MIN_NEWLINES) {
    return null;
  }

  const lastNL = gap.lastIndexOf('\n');
  const indent = lastNL === -1 ? '' : gap.slice(lastNL + 1);
  const trimmed = gap.slice(0, gap.length - indent.length).replace(/\n*$/u, '');
  const newGap = `${trimmed}${'\n'.repeat(MIN_NEWLINES)}${indent}`;

  return { start: gapStart, end: gapEnd, replacement: newGap };
}

function countNewlines(s: string): number {
  return (s.match(/\n/gu) ?? []).length;
}

function planCollapseEdit(gap: Gap): Edit | null {
  if (gap.comments.length > 0) {
    return null;
  }

  const text = gap.src.slice(gap.start, gap.end);

  if (countNewlines(text) < MIN_NEWLINES) {
    return null;
  }

  const indent = text.slice(text.lastIndexOf('\n') + 1);

  return { start: gap.start, end: gap.end, replacement: `\n${indent}` };
}
