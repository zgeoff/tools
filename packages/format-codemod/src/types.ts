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
