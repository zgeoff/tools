// The fields of the oxc AST this transform reads; the index signature carries
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
  readonly [key: string]: unknown;
}

export interface CommentSpan {
  readonly start: number;
  readonly end: number;
}

export interface ParsedSource {
  readonly program: AstNode;
  readonly comments: readonly CommentSpan[];
}

// The raw text and its comment spans together — what gap planning needs to
// classify inter-statement trivia without re-lexing.
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

export type CliMode = 'write' | 'check' | 'dry';

export type FileOutcome = 'ok' | 'changed' | 'failed' | 'skipped';

export interface FileReport {
  readonly outcome: FileOutcome;
  readonly bytes: number;
  readonly parsed: boolean;
}

export interface FileEdit {
  readonly file: string;
  readonly src: string;
  readonly result: TransformResult;
}

export interface BenchStats {
  readonly files: number;
  readonly parsed: number;
  readonly bytes: number;
  readonly ms: number;
  readonly us_per_file: number;
  readonly mb_per_sec: number;
}
