import type { Visitor, parseSync } from 'oxc-parser';

export interface OxcParserModule {
  readonly Visitor: typeof Visitor;

  readonly parseSync: typeof parseSync;
}
