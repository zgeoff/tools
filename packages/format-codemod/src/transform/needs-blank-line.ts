import type { ASTNode } from '../types.ts';
import { collectASTNodes } from './collect-ast-nodes.ts';
import { collectHeadChain } from './collect-head-chain.ts';
import { isASTNode } from './is-ast-node.ts';

// ESLint maps the `for` keyword to all three for-forms and `while` to the
// while loop only; `do-while` is a separate `do` selector this config omits
const CONTROL_FLOW_TYPES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'SwitchStatement',
  'TryStatement',
]);

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

function isRunEnd(prev: ASTNode, next: ASTNode): boolean {
  return (
    (isVarDecl(prev) && !isVarDecl(next)) ||
    (isUsingDecl(prev) && !isUsingDecl(next)) ||
    (isDirective(prev) && !isDirective(next)) ||
    (prev.type === 'ImportDeclaration' && next.type !== 'ImportDeclaration')
  );
}

function isDirective(node: ASTNode): boolean {
  return typeof node['directive'] === 'string';
}

const TYPE_DECL_TYPES = new Set(['TSTypeAliasDeclaration', 'TSInterfaceDeclaration']);

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

function isNewHeaded(node: ASTNode): boolean {
  return getStatementValues(node).some(
    (value) => collectHeadChain(value).at(-1)?.type === 'NewExpression',
  );
}

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
    return isExpectHeaded(node) ? 'expect' : pickCallKind(node);
  }

  return isExpressionStatementOf(node, MUTATION_TYPES) ? 'mutation' : null;
}

function isExpectHeaded(node: ASTNode): boolean {
  const expression = node['expression'];
  const callee = isASTNode(expression) ? findDeepestCallee(expression) : null;

  if (callee === null) {
    return false;
  }

  const head = collectHeadChain(callee).at(-1);

  return head?.type === 'Identifier' && head['name'] === 'expect';
}

function pickCallKind(node: ASTNode): 'bare-call' | 'method-call' {
  const expression = node['expression'];
  const callee = isASTNode(expression) ? findDeepestCallee(expression) : null;

  return callee?.type === 'MemberExpression' ? 'method-call' : 'bare-call';
}

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

// ESLint's padding-line-between-statements does not look through `export`,
// so `export const x = 1` is not a `const` for the rule
function isVarDecl(node: ASTNode): boolean {
  if (node.type === 'VariableDeclaration') {
    return node.kind !== undefined && VAR_DECL_KINDS.has(node.kind);
  }

  return false;
}

const USING_DECL_KINDS = new Set(['using', 'await using']);

function isUsingDecl(node: ASTNode): boolean {
  if (node.type === 'VariableDeclaration') {
    return node.kind !== undefined && USING_DECL_KINDS.has(node.kind);
  }

  return false;
}

// ESLint's `prev: ['function', 'class']` does not match `export function` or
// `export class` (those parse as ExportNamedDeclaration), so neither does this
function isFnOrClassDecl(node: ASTNode): boolean {
  return node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration';
}
