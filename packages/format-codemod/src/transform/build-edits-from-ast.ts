import type { ASTNode, Edit, ParsedSource, SourceFile } from '../types.ts';
import { planGapEdit } from './plan-gap-edit.ts';

/**
 * Sorted last-to-first so applying splices in order never shifts later offsets.
 */
export function buildEditsFromAST(src: string, parsed: ParsedSource): Edit[] {
  const file: SourceFile = { src, comments: parsed.comments };

  return walk(file, parsed.program).toSorted((a, b) => b.start - a.start);
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

/**
 * The statement lists this node directly contains — the sequences whose
 * adjacent pairs the padding rules apply to.
 */
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

    if (prev !== undefined && next !== undefined && needsBlankLine(container, prev, next)) {
      const edit = planGapEdit(file, prev, next);

      if (edit !== null) {
        edits.push(edit);
      }
    }
  }

  return edits;
}

/**
 * ESLint maps the `for` keyword to all three for-forms and `while` to the
 * while loop only (`do-while` is a separate `do` selector this config omits).
 */
const CONTROL_FLOW_TYPES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'SwitchStatement',
  'TryStatement',
]);

/**
 * The "always" half of the ESLint padding config: a blank line between class
 * members, after a var block before a non-var statement, before a return,
 * after a function/class declaration, and before a control-flow block. The
 * config has no "never" rules, so any match means one blank. Control-flow is
 * gated on `next` only (not `prev`), so guard clauses stay tight after a block.
 */
function needsBlankLine(container: ASTNode, prev: ASTNode, next: ASTNode): boolean {
  if (container.type === 'ClassBody') {
    return true;
  }

  if (isVarDecl(prev) && !isVarDecl(next)) {
    return true;
  }

  if (next.type === 'ReturnStatement') {
    return true;
  }

  if (isFnOrClassDecl(prev)) {
    return true;
  }

  return CONTROL_FLOW_TYPES.has(next.type);
}

const VAR_DECL_KINDS = new Set(['const', 'let', 'var']);

/**
 * Bare variable declarations only. ESLint's padding-line-between-statements does
 * not look through `export`, so `export const x = 1` is NOT a `const` for the
 * rule — matching that keeps the codemod faithful to the ESLint config.
 */
function isVarDecl(node: ASTNode): boolean {
  if (node.type === 'VariableDeclaration') {
    return node.kind !== undefined && VAR_DECL_KINDS.has(node.kind);
  }

  return false;
}

/**
 * Bare function/class declarations only. As with var declarations, ESLint's
 * `prev: ['function', 'class']` does not match `export function`/`export class`
 * (those parse as ExportNamedDeclaration), so neither do we.
 */
function isFnOrClassDecl(node: ASTNode): boolean {
  return node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration';
}

function collectChildNodes(node: ASTNode): ASTNode[] {
  const children: ASTNode[] = [];

  for (const key of Object.keys(node)) {
    if (key !== 'loc' && key !== 'parent') {
      children.push(...collectASTNodes(node[key]));
    }
  }

  return children;
}

function collectASTNodes(value: unknown): ASTNode[] {
  if (!Array.isArray(value)) {
    return isASTNode(value) ? [value] : [];
  }
  const nodes: ASTNode[] = [];

  for (const item of value) {
    if (isASTNode(item)) {
      nodes.push(item);
    }
  }

  return nodes;
}

function isASTNode(value: unknown): value is ASTNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}
