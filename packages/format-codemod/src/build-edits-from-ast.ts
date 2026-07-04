import { planGapEdit } from './plan-gap-edit.ts';
import type { AstNode, Edit } from './types.ts';

// Sorted last-to-first so applying splices in order never shifts later offsets.
export function buildEditsFromAst(src: string, ast: AstNode): Edit[] {
  return walk(src, ast).toSorted((a, b) => b.start - a.start);
}

function walk(src: string, node: AstNode): Edit[] {
  const edits: Edit[] = [];

  for (const body of getStatementLists(node)) {
    edits.push(...buildPairEdits(src, node, body));
  }

  for (const child of collectChildNodes(node)) {
    edits.push(...walk(src, child));
  }

  return edits;
}

// The statement lists this node directly contains — the sequences whose
// adjacent pairs the padding rules apply to.
function getStatementLists(node: AstNode): (readonly AstNode[])[] {
  const bodies: (readonly AstNode[])[] = [];
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

function buildPairEdits(src: string, container: AstNode, body: readonly AstNode[]): Edit[] {
  const edits: Edit[] = [];

  for (let i = 0; i < body.length - 1; i++) {
    const prev = body[i];
    const next = body[i + 1];

    if (prev !== undefined && next !== undefined && needsBlankLine(container, prev, next)) {
      const edit = planGapEdit(src, prev, next);

      if (edit !== null) {
        edits.push(edit);
      }
    }
  }

  return edits;
}

// ESLint maps the `for` keyword to all three for-forms and `while` to the
// while loop only (`do-while` is a separate `do` selector this config omits).
const CONTROL_FLOW_TYPES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'SwitchStatement',
  'TryStatement',
]);

// The "always" half of the ESLint padding config: a blank line between class
// members, after a var block before a non-var statement, before a return,
// after a function/class declaration, and before a control-flow block. The
// config has no "never" rules, so any match means one blank. Control-flow is
// gated on `next` only (not `prev`), so guard clauses stay tight after a block.
function needsBlankLine(container: AstNode, prev: AstNode, next: AstNode): boolean {
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

// Bare variable declarations only. ESLint's padding-line-between-statements does
// not look through `export`, so `export const x = 1` is NOT a `const` for the
// rule — matching that keeps the codemod faithful to the ESLint config.
function isVarDecl(node: AstNode): boolean {
  if (node.type === 'VariableDeclaration') {
    return node.kind !== undefined && VAR_DECL_KINDS.has(node.kind);
  }

  return false;
}

// Bare function/class declarations only. As with var declarations, ESLint's
// `prev: ['function', 'class']` does not match `export function`/`export class`
// (those parse as ExportNamedDeclaration), so neither do we.
function isFnOrClassDecl(node: AstNode): boolean {
  return node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration';
}

function collectChildNodes(node: AstNode): AstNode[] {
  const children: AstNode[] = [];

  for (const key of Object.keys(node)) {
    if (key !== 'loc' && key !== 'parent') {
      children.push(...collectAstNodes(node[key]));
    }
  }

  return children;
}

function collectAstNodes(value: unknown): AstNode[] {
  if (!Array.isArray(value)) {
    return isAstNode(value) ? [value] : [];
  }
  const nodes: AstNode[] = [];

  for (const item of value) {
    if (isAstNode(item)) {
      nodes.push(item);
    }
  }

  return nodes;
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}
