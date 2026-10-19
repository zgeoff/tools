import type { ASTNode, Edit, ParsedSource, SourceFile } from '../types.ts';
import { collectChildNodes } from './collect-child-nodes.ts';
import { planGapEdit } from './plan-gap-edit.ts';
import { shouldHaveBlankLine } from './should-have-blank-line.ts';

export function buildEditsFromAST(source: string, parsed: ParsedSource): Edit[] {
  const file: SourceFile = { source, comments: parsed.comments };

  return walk(file, parsed.program).toSorted((first, second) => second.start - first.start);
}

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

  for (let index = 0; index < body.length - 1; index++) {
    const previous = body[index];
    const next = body[index + 1];

    if (previous !== undefined && next !== undefined && !isImportPair(previous, next)) {
      const pad =
        shouldHaveBlankLine(container, previous, next) ||
        isMultiline(file.source, previous) ||
        isMultiline(file.source, next);

      const edit = planGapEdit({ file, previous, next, pad });

      if (edit !== null) {
        edits.push(edit);
      }
    }
  }

  return edits;
}

// the interior of an import block belongs to the import sorter, which would
// reorder or strip any edit made there
function isImportPair(previous: ASTNode, next: ASTNode): boolean {
  return previous.type === 'ImportDeclaration' && next.type === 'ImportDeclaration';
}

function isMultiline(source: string, node: ASTNode): boolean {
  return (
    typeof node.start === 'number' &&
    typeof node.end === 'number' &&
    source.slice(node.start, node.end).includes('\n')
  );
}
