import { collectASTNodes } from '../src/transform/collect-ast-nodes.ts';
import { isASTNode } from '../src/transform/is-ast-node.ts';
import type { ASTNode } from '../src/types.ts';
import { parseSourceOrThrow } from './parse-source-or-throw.ts';

export interface StatementPair {
  container: ASTNode;
  previous: ASTNode;
  next: ASTNode;
}

export function parseStatementPair(body: string): StatementPair {
  const parsed = parseSourceOrThrow(`async function f(x) {\n${body}\n}`);
  const [fn] = collectASTNodes(parsed.program.body);
  const fnBody = fn?.body;
  const container = isASTNode(fnBody) ? fnBody : undefined;
  const [previous, next] = collectASTNodes(container?.body);

  if (container === undefined || previous === undefined || next === undefined) {
    throw new TypeError('fixture must parse to a function holding at least two statements');
  }

  return { container, previous, next };
}
