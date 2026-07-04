// The fields of the babel AST this transform reads; the index signature carries
// every other node property so the generic child walk can recurse untyped. The
// codemod never mutates the tree, so everything is readonly.
export interface AstNode {
  readonly type: string;
  readonly kind?: string;
  readonly start?: number;
  readonly end?: number;
  readonly body?: readonly AstNode[] | AstNode;
  readonly consequent?: readonly AstNode[];
  readonly declaration?: AstNode;
  readonly program?: AstNode;
  readonly [key: string]: unknown;
}

export interface Edit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

export interface TransformResult {
  readonly output: string;
  readonly edits: number;
  readonly parseError: string | null;
}
