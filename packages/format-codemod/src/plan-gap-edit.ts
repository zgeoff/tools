import type { AstNode, Edit } from './types.ts';

// Every rule is "exactly one blank line", so a compliant gap always holds two
// newlines: one ending the previous statement's line, one for the blank.
const MIN_NEWLINES = 2;

// Plans the single whitespace splice that gives the gap between two statements
// exactly one blank line, or null when the gap is already compliant or unsafe
// to touch.
export function planGapEdit(src: string, prev: AstNode, next: AstNode): Edit | null {
  const gapStart = getNodeEnd(prev);
  const gapEnd = getNodeStart(next);
  const gap = src.slice(gapStart, gapEnd);

  if (stripCommentsAndWhitespace(gap) !== '') {
    return null;
  }

  // The two statements share a physical line, which happens when a leading
  // semicolon (`;(expr)` ASI guard) terminates the previous statement: babel
  // folds that `;` into the prior node, so the gap falls between `;` and `(`.
  // A blank-only codemod cannot separate them without orphaning the `;`, so skip.
  if (!gap.includes('\n')) {
    return null;
  }

  if (/\/\/|\/\*/u.test(gap)) {
    return planCommentGap(src, gapStart, gapEnd);
  }

  return planWhitespaceGap(gap, gapStart, gapEnd);
}

function getNodeEnd(n: AstNode): number {
  if (typeof n.end !== 'number') {
    throw new TypeError('AST node is missing an end position');
  }

  return n.end;
}

function getNodeStart(n: AstNode): number {
  if (typeof n.start !== 'number') {
    throw new TypeError('AST node is missing a start position');
  }

  return n.start;
}

function stripCommentsAndWhitespace(s: string): string {
  return s
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/\/\/[^\n]*/gu, '')
    .replaceAll(/\s+/gu, '');
}

// A trailing same-line comment stays attached to the previous statement, so the
// gap is measured from just past it; any comment after that point is a leading
// comment for the next statement.
function planCommentGap(src: string, gapStart: number, gapEnd: number): Edit | null {
  const gap = src.slice(gapStart, gapEnd);
  const trailing = /^[ \t]*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/u.exec(gap);
  let effectiveStart = gapStart;

  if (trailing !== null) {
    effectiveStart = gapStart + trailing[0].length;
  }
  const rest = src.slice(effectiveStart, gapEnd);

  if (/\/\/|\/\*/u.test(rest)) {
    return planLeadingCommentEdit(rest, effectiveStart);
  }

  return planWhitespaceGap(rest, effectiveStart, gapEnd);
}

// The gap opens with a comment that belongs to the next statement: the blank
// line goes before that comment, preserving whatever whitespace leads into it.
function planLeadingCommentEdit(rest: string, restStart: number): Edit | null {
  const m = /^(?<leading>\s*)(?:\/\/|\/\*)/u.exec(rest);
  const leading = m?.groups?.['leading'];

  if (leading === undefined) {
    return null;
  }
  const leadingNewlines = (leading.match(/\n/gu) ?? []).length;

  if (leadingNewlines >= MIN_NEWLINES) {
    return null;
  }
  const additional = MIN_NEWLINES - leadingNewlines;

  return {
    start: restStart,
    end: restStart + leading.length,
    replacement: `${'\n'.repeat(additional)}${leading}`,
  };
}

function planWhitespaceGap(gap: string, gapStart: number, gapEnd: number): Edit | null {
  const newlines = (gap.match(/\n/gu) ?? []).length;

  if (newlines >= MIN_NEWLINES) {
    return null;
  }
  const lastNL = gap.lastIndexOf('\n');
  const indent = lastNL === -1 ? '' : gap.slice(lastNL + 1);
  const trimmed = gap.slice(0, gap.length - indent.length).replace(/\n*$/u, '');
  const newGap = `${trimmed}${'\n'.repeat(MIN_NEWLINES)}${indent}`;

  return { start: gapStart, end: gapEnd, replacement: newGap };
}
