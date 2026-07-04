import { createRequire } from 'node:module';
import type { AstNode } from './types.ts';

// @babel/parser is CommonJS; createRequire loads it without the ESM/CJS interop
// dance. We parse with it directly rather than through jscodeshift, whose j()
// routes the parse through recast — recast remaps node offsets and they drift
// from the raw source in files with multi-line template literals, which makes
// the text splice land mid-statement and corrupt code.
const requireCjs = createRequire(import.meta.url);
const babelParserModule: unknown = requireCjs('@babel/parser');

function isBabelParser(
  value: unknown,
): value is { parse: (code: string, options: unknown) => AstNode } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'parse' in value &&
    typeof value.parse === 'function'
  );
}

if (!isBabelParser(babelParserModule)) {
  throw new TypeError('@babel/parser module does not expose a parse function');
}
const babelParser = babelParserModule;

// The exact plugin set jscodeshift's 'tsx' parser passes to @babel/parser
// (tsOptions + jsx), so parse behaviour matches what the snapshots assert.
const PARSER_OPTIONS = {
  sourceType: 'module',
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  startLine: 1,
  plugins: [
    'jsx',
    'asyncGenerators',
    'decoratorAutoAccessors',
    'bigInt',
    'classPrivateMethods',
    'classPrivateProperties',
    'classProperties',
    'decorators-legacy',
    'doExpressions',
    'dynamicImport',
    'exportDefaultFrom',
    'exportExtensions',
    'exportNamespaceFrom',
    'functionBind',
    'functionSent',
    'importAttributes',
    'importMeta',
    'nullishCoalescingOperator',
    'numericSeparator',
    'objectRestSpread',
    'optionalCatchBinding',
    'optionalChaining',
    ['pipelineOperator', { proposal: 'minimal' }],
    'throwExpressions',
    'typescript',
  ],
};

// Throws on syntax errors — callers own the recovery strategy.
export function parseSource(src: string): AstNode {
  return babelParser.parse(src, PARSER_OPTIONS);
}
