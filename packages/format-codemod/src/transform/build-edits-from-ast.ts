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

    if (
      prev !== undefined &&
      next !== undefined &&
      (needsBlankLine(container, prev, next) ||
        isMultiline(file.src, prev) ||
        isMultiline(file.src, next))
    ) {
      const edit = planGapEdit(file, prev, next);

      if (edit !== null) {
        edits.push(edit);
      }
    }
  }

  return edits;
}

/**
 * A statement that spans multiple lines is separated from both neighbours —
 * its shape already reads as a paragraph, so it gets paragraph spacing.
 * Single-line statements may sit tight.
 */
function isMultiline(src: string, node: ASTNode): boolean {
  return (
    typeof node.start === 'number' &&
    typeof node.end === 'number' &&
    src.slice(node.start, node.end).includes('\n')
  );
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
 * The "always" rules: a blank line between class members, after a var block
 * before a non-var statement, before a return, after a function/class
 * declaration, on both sides of a control-flow block — its closing brace
 * ends a visual unit just like its opening keyword starts one — and at the
 * boundary between statement kinds: call vs mutation, and instantiation vs
 * anything else. There are no "never" rules, so any match means one blank.
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

  return (
    isNewHeaded(prev) !== isNewHeaded(next) ||
    isCallMutationBoundary(prev, next) ||
    CONTROL_FLOW_TYPES.has(next.type) ||
    CONTROL_FLOW_TYPES.has(prev.type)
  );
}

/**
 * A statement whose value expression is headed by `new` does construction —
 * a different kind of work from calling, mutating, or plain declaring, so it
 * is boundary-padded from all of them while runs of instantiations stay
 * tight. Only the head of the expression chain decides: `new` in argument
 * position is incidental and doesn't count.
 */
function isNewHeaded(node: ASTNode): boolean {
  return getStatementValues(node).some(
    (value) => getExpressionHead(value).type === 'NewExpression',
  );
}

/**
 * The value expressions a statement is built around: declaration initializers,
 * an assignment's right-hand side, or the expression itself. Statements with
 * no value expression (control flow, returns, declarations without
 * initializers) yield none.
 */
function getStatementValues(node: ASTNode): ASTNode[] {
  if (node.type === 'VariableDeclaration') {
    return collectASTNodes(node['declarations'])
      .map((declarator) => declarator['init'])
      .filter((init): init is ASTNode => isASTNode(init));
  }

  const { expression } = node;

  if (node.type !== 'ExpressionStatement' || !isASTNode(expression)) {
    return [];
  }

  const { right } = expression;

  if (expression.type === 'AssignmentExpression' && isASTNode(right)) {
    return [right];
  }

  return [expression];
}

/**
 * Wrapper node types whose named property leads toward the head of an
 * expression chain — `a.b().c` unwraps call by call, member by member, down
 * to `a`.
 */
const HEAD_PROPERTY: Readonly<Record<string, string>> = {
  CallExpression: 'callee',
  MemberExpression: 'object',
  ChainExpression: 'expression',
  AwaitExpression: 'argument',
  TSNonNullExpression: 'expression',
  ParenthesizedExpression: 'expression',
};

function getExpressionHead(node: ASTNode): ASTNode {
  let current = node;
  let property = HEAD_PROPERTY[current.type];

  while (property !== undefined) {
    const inner = current[property];

    if (!isASTNode(inner)) {
      break;
    }

    current = inner;
    property = HEAD_PROPERTY[current.type];
  }

  return current;
}

const CALL_TYPES: readonly string[] = ['CallExpression', 'AwaitExpression'];

const MUTATION_TYPES: readonly string[] = ['AssignmentExpression', 'UpdateExpression'];

/**
 * A transition between a call statement ("do something") and a mutation
 * statement (assignment or increment, "track something") — the two read as
 * different kinds of work, so a blank line marks the switch. Runs of the same
 * kind stay tight.
 */
function isCallMutationBoundary(prev: ASTNode, next: ASTNode): boolean {
  return (
    (isExpressionStatementOf(prev, CALL_TYPES) && isExpressionStatementOf(next, MUTATION_TYPES)) ||
    (isExpressionStatementOf(prev, MUTATION_TYPES) && isExpressionStatementOf(next, CALL_TYPES))
  );
}

function isExpressionStatementOf(node: ASTNode, types: readonly string[]): boolean {
  const { expression } = node;

  return (
    node.type === 'ExpressionStatement' && isASTNode(expression) && types.includes(expression.type)
  );
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
