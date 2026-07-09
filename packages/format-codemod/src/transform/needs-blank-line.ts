import type { ASTNode } from '../types.ts';
import { collectASTNodes } from './collect-ast-nodes.ts';
import { collectHeadChain } from './collect-head-chain.ts';
import { isASTNode } from './is-ast-node.ts';

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
 * The "always" rules: a blank line between class members, after a var or
 * using block before a statement of any other kind, after a directive
 * prologue, after the last import of a block, before a return, after a
 * function/class declaration, on both sides of a type alias or interface
 * declaration, on both sides of a control-flow block — its closing brace
 * ends a visual unit just like its opening keyword starts one —
 * and at the boundary between statement kinds: bare call vs method call vs
 * mutation, instantiation vs anything else, and awaited vs non-awaited. Any
 * match means exactly one blank line; a pair matching no rule sits flush.
 */
export function needsBlankLine(container: ASTNode, prev: ASTNode, next: ASTNode): boolean {
  if (container.type === 'ClassBody') {
    return true;
  }

  if (isRunEnd(prev, next) || next.type === 'ReturnStatement' || isFnOrClassDecl(prev)) {
    return true;
  }

  if (isTypeDecl(prev) || isTypeDecl(next)) {
    return true;
  }

  return (
    isNewHeaded(prev) !== isNewHeaded(next) ||
    isAwaitHeaded(prev) !== isAwaitHeaded(next) ||
    isKindBoundary(prev, next) ||
    CONTROL_FLOW_TYPES.has(next.type) ||
    CONTROL_FLOW_TYPES.has(prev.type)
  );
}

/**
 * Statements that glue into a homogeneous run — var declarations, using
 * declarations, directives, imports — take a blank line where the run ends:
 * after the last statement of the run, before the first of any other kind.
 */
function isRunEnd(prev: ASTNode, next: ASTNode): boolean {
  return (
    (isVarDecl(prev) && !isVarDecl(next)) ||
    (isUsingDecl(prev) && !isUsingDecl(next)) ||
    (isDirective(prev) && !isDirective(next)) ||
    (prev.type === 'ImportDeclaration' && next.type !== 'ImportDeclaration')
  );
}

/**
 * A directive-prologue statement (`'use strict'`, `'use client'`). The parser
 * marks these with a `directive` field, so string-expression statements deeper
 * in a body don't count. Runs of directives stay tight; the boundary after the
 * last one is padded.
 */
function isDirective(node: ASTNode): boolean {
  return typeof node['directive'] === 'string';
}

const TYPE_DECL_TYPES = new Set(['TSTypeAliasDeclaration', 'TSInterfaceDeclaration']);

/**
 * Type aliases and interfaces take a blank line on both sides — every one is
 * its own paragraph, so runs of them are padded apart rather than glued. The
 * breathing room belongs to the declaration, not its wrapper, so this looks
 * through `export`.
 */
function isTypeDecl(node: ASTNode): boolean {
  if (TYPE_DECL_TYPES.has(node.type)) {
    return true;
  }

  const declaration = node.declaration;

  return (
    node.type === 'ExportNamedDeclaration' &&
    isASTNode(declaration) &&
    TYPE_DECL_TYPES.has(declaration.type)
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
    (value) => collectHeadChain(value).at(-1)?.type === 'NewExpression',
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

  const expression = node['expression'];

  if (node.type !== 'ExpressionStatement' || !isASTNode(expression)) {
    return [];
  }

  const right = expression['right'];

  if (expression.type === 'AssignmentExpression' && isASTNode(right)) {
    return [right];
  }

  return [expression];
}

/**
 * A statement that suspends on `await` — an `await using` declaration, or any
 * statement whose value expression passes through an await on the way to its
 * head. Suspension is a different kind of work from synchronous statements,
 * so the transition is boundary-padded while runs of awaited statements stay
 * tight. As with `new`, only the head chain decides: an await in argument
 * position (`use(await f())`) or below a non-chain head (`flag ? await f() :
 * g()`) is incidental and doesn't count.
 */
function isAwaitHeaded(node: ASTNode): boolean {
  if (node.type === 'VariableDeclaration' && node.kind === 'await using') {
    return true;
  }

  return getStatementValues(node).some((value) =>
    collectHeadChain(value).some((link) => link.type === 'AwaitExpression'),
  );
}

const CALL_TYPES: readonly string[] = ['CallExpression', 'AwaitExpression'];
const MUTATION_TYPES: readonly string[] = ['AssignmentExpression', 'UpdateExpression'];

/**
 * A transition between statement kinds — declaring ("name something"),
 * calling ("do something"), mutating ("track something") — reads as a switch
 * to a different kind of work, so a blank line marks it. Runs of one kind
 * stay tight, and kindless statements (control flow, returns, throws) don't
 * force a boundary here — their own rules govern them.
 */
function isKindBoundary(prev: ASTNode, next: ASTNode): boolean {
  const prevKind = getStatementKind(prev);
  const nextKind = getStatementKind(next);

  return prevKind !== null && nextKind !== null && prevKind !== nextKind;
}

function getStatementKind(node: ASTNode): string | null {
  if (isUsingDecl(node)) {
    return 'using';
  }

  if (isVarDecl(node)) {
    return 'declaration';
  }

  if (isExpressionStatementOf(node, CALL_TYPES)) {
    return pickCallKind(node);
  }

  return isExpressionStatementOf(node, MUTATION_TYPES) ? 'mutation' : null;
}

/**
 * Call statements split into two kinds by the first call a reader meets:
 * `expect(x).toBe(y)` opens with a bare function, `fs.writeFileSync(...)`
 * opens with a member. The deepest call in the head chain decides, so a
 * member call chained onto a bare call's result is still a bare call, and a
 * wrapping await doesn't change the kind.
 */
function pickCallKind(node: ASTNode): 'bare-call' | 'method-call' {
  const expression = node['expression'];
  const callee = isASTNode(expression) ? findDeepestCallee(expression) : null;

  return callee?.type === 'MemberExpression' ? 'method-call' : 'bare-call';
}

/**
 * The callee of the deepest CallExpression on the walk from an expression to
 * its head — the call performed first in reading order — or null when the
 * head chain holds no call (a bare `await value`, for example).
 */
function findDeepestCallee(expression: ASTNode): ASTNode | null {
  const deepestCall = collectHeadChain(expression).findLast(
    (link) => link.type === 'CallExpression',
  );

  const callee = deepestCall?.['callee'];

  return isASTNode(callee) ? callee : null;
}

function isExpressionStatementOf(node: ASTNode, types: readonly string[]): boolean {
  const expression = node['expression'];

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

const USING_DECL_KINDS = new Set(['using', 'await using']);

/**
 * `using` and `await using` declarations. They register a disposal rather
 * than merely naming a value, so they form their own statement kind: runs
 * stay tight and every boundary with another statement is padded.
 */
function isUsingDecl(node: ASTNode): boolean {
  if (node.type === 'VariableDeclaration') {
    return node.kind !== undefined && USING_DECL_KINDS.has(node.kind);
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
