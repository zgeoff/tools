/**
 * The fields of the oxc AST this transform reads; the index signature carries
 * every other node property so the generic child walk can recurse untyped. The
 * codemod never mutates the tree, so everything is readonly.
 */
export interface ASTNode {
  readonly type: string;
  readonly kind?: string;
  readonly start?: number;
  readonly end?: number;
  readonly body?: readonly ASTNode[] | ASTNode;
  readonly consequent?: readonly ASTNode[];
  readonly declaration?: ASTNode;
  readonly [key: string]: unknown;
}

export interface CommentSpan {
  readonly start: number;
  readonly end: number;
}

export interface ParsedSource {
  readonly program: ASTNode;
  readonly comments: readonly CommentSpan[];
}

/**
 * The raw text and its comment spans together — what gap planning needs to
 * classify inter-statement trivia without re-lexing.
 */
export interface SourceFile {
  readonly src: string;
  readonly comments: readonly CommentSpan[];
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
