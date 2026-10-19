import type { ASTNode, CommentSpan, Edit, SourceFile } from '../types.ts';

export interface GapEditInput {
  readonly file: SourceFile;
  readonly previous: ASTNode;
  readonly next: ASTNode;
  readonly pad: boolean;
}

export function planGapEdit(input: GapEditInput): Edit | null {
  const gap = buildGap(input.file, input.previous, input.next);

  if (!isSafeToResize(gap)) {
    return null;
  }

  return input.pad ? planBlankLineEdit(gap) : planCollapseEdit(gap);
}

interface Gap {
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly comments: readonly CommentSpan[];
}

function buildGap(file: SourceFile, previous: ASTNode, next: ASTNode): Gap {
  const start = getNodeEnd(previous);
  const end = getNodeStart(next);
  const comments = file.comments.filter((comment) => comment.start >= start && comment.end <= end);

  return { source: file.source, start, end, comments };
}

function getNodeEnd(node: ASTNode): number {
  if (typeof node.end !== 'number') {
    throw new TypeError('AST node is missing an end position');
  }

  return node.end;
}

function getNodeStart(node: ASTNode): number {
  if (typeof node.start !== 'number') {
    throw new TypeError('AST node is missing a start position');
  }

  return node.start;
}

// same-line statements come from a leading-semicolon ASI guard (`;(expr)`):
// the parser folds that `;` into the prior node, so the gap falls between `;`
// and `(` and a blank-only splice would orphan the `;`
function isSafeToResize(gap: Gap): boolean {
  return isTriviaOnly(gap) && gap.source.slice(gap.start, gap.end).includes('\n');
}

function isTriviaOnly(gap: Gap): boolean {
  let cursor = gap.start;

  for (const comment of gap.comments) {
    if (gap.source.slice(cursor, comment.start).trim() !== '') {
      return false;
    }

    cursor = comment.end;
  }

  return gap.source.slice(cursor, gap.end).trim() === '';
}

function planBlankLineEdit(gap: Gap): Edit | null {
  const effectiveStart = getEffectiveGapStart(gap);
  const leadingComment = gap.comments.find((comment) => comment.start >= effectiveStart);

  if (leadingComment !== undefined) {
    return planLeadingCommentEdit(gap.source, effectiveStart, leadingComment.start);
  }

  return planWhitespaceGap(gap.source.slice(effectiveStart, gap.end), effectiveStart, gap.end);
}

function getEffectiveGapStart(gap: Gap): number {
  let position = gap.start;

  for (const comment of gap.comments) {
    if (gap.source.slice(position, comment.start).includes('\n')) {
      break;
    }

    position = comment.end;
  }

  return position;
}

const MIN_NEWLINES = 2;

function planLeadingCommentEdit(
  source: string,
  restStart: number,
  commentStart: number,
): Edit | null {
  const leading = source.slice(restStart, commentStart);
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

function countNewlines(text: string): number {
  return (text.match(/\n/gu) ?? []).length;
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

function planCollapseEdit(gap: Gap): Edit | null {
  if (gap.comments.length > 0) {
    return null;
  }

  const text = gap.source.slice(gap.start, gap.end);

  if (countNewlines(text) < MIN_NEWLINES) {
    return null;
  }

  const indent = text.slice(text.lastIndexOf('\n') + 1);

  return { start: gap.start, end: gap.end, replacement: `\n${indent}` };
}
