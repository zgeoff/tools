import type { ASTNode, Edit, ParsedSource, SourceFile } from '../types.ts';
import { collectChildNodes } from './collect-child-nodes.ts';
import { needsBlankLine } from './needs-blank-line.ts';
import { planGapEdit } from './plan-gap-edit.ts';

export function buildEditsFromAST(src: string, parsed: ParsedSource): Edit[] {
  const file: SourceFile = { src, comments: parsed.comments };

  return walk(file, parsed.program).toSorted((a, b) => b.start - a.start);
}

// oxlint-disable-next-line zgeoff/function-verb -- algorithm-native traversal vocabulary
function walk(file: SourceFile, node: ASTNode): Edit[] {
  const edits: Edit[] = [];

  for (const body of getStatementLists(node)) {
    edits.push(...buildPairEdits(file, node, body));
  }

  for (const child of collectChildNodes(node)) {
    edits.push(...walk(file, child));
  }

  return edits;
}

function getStatementLists(node: ASTNode): (readonly ASTNode[])[] {
  const bodies: (readonly ASTNode[])[] = [];

  const hasBlockBody =
    node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'ClassBody';

  if (hasBlockBody && Array.isArray(node.body)) {
    bodies.push(node.body);
  }

  if (node.type === 'SwitchCase' && Array.isArray(node.consequent)) {
    bodies.push(node.consequent);
  }

  return bodies;
}

function buildPairEdits(file: SourceFile, container: ASTNode, body: readonly ASTNode[]): Edit[] {
  const edits: Edit[] = [];

  for (let i = 0; i < body.length - 1; i++) {
    const prev = body[i];
    const next = body[i + 1];

    if (prev !== undefined && next !== undefined && !isImportPair(prev, next)) {
      const pad =
        needsBlankLine(container, prev, next) ||
        isMultiline(file.src, prev) ||
        isMultiline(file.src, next);

      const edit = planGapEdit({ file, prev, next, pad });

      if (edit !== null) {
        edits.push(edit);
      }
    }
  }

  return edits;
}

// the interior of an import block belongs to the import sorter, which would
// reorder or strip any edit made there
function isImportPair(prev: ASTNode, next: ASTNode): boolean {
  return prev.type === 'ImportDeclaration' && next.type === 'ImportDeclaration';
}

function isMultiline(src: string, node: ASTNode): boolean {
  return (
    typeof node.start === 'number' &&
    typeof node.end === 'number' &&
    src.slice(node.start, node.end).includes('\n')
  );
}
