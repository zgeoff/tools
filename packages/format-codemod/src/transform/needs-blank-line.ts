import type { ASTNode } from '../types.ts';
import { collectASTNodes } from './collect-ast-nodes.ts';
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
 * using block before a statement of any other kind, before a return, after a
 * function/class declaration, on both sides of a control-flow block — its
 * closing brace ends a visual unit just like its opening keyword starts one —
 * and at the boundary between statement kinds: call vs mutation,
 * instantiation vs anything else, and awaited vs non-awaited. There are no
 * "never" rules, so any match means one blank.
 */
export function needsBlankLine(container: ASTNode, prev: ASTNode, next: ASTNode): boolean {
  if (container.type === 'ClassBody') {
    return true;
  }

  if ((isVarDecl(prev) && !isVarDecl(next)) || (isUsingDecl(prev) && !isUsingDecl(next))) {
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
    isAwaitHeaded(prev) !== isAwaitHeaded(next) ||
    isKindBoundary(prev, next) ||
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

  return getStatementValues(node).some((value) => hasAwaitInHeadChain(value));
}

/**
 * True when the walk from an expression down to its head passes through an
 * AwaitExpression — `await f()`, `(await f()).prop`, `(await f()).method()` —
 * as opposed to an await buried outside the head chain.
 */
function hasAwaitInHeadChain(node: ASTNode): boolean {
  let current: ASTNode | undefined = node;

  while (current !== undefined) {
    if (current.type === 'AwaitExpression') {
      return true;
    }

    const property: string | undefined = HEAD_PROPERTY[current.type];
    const inner: unknown = property === undefined ? undefined : current[property];

    current = isASTNode(inner) ? inner : undefined;
  }

  return false;
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
    return 'call';
  }

  return isExpressionStatementOf(node, MUTATION_TYPES) ? 'mutation' : null;
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
