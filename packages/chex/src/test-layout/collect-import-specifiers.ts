import type { Expression, Program, StringLiteral } from 'oxc-parser';
import type { OxcParserModule } from './oxc-parser-module.ts';

export function collectImportSpecifiers(oxc: OxcParserModule, program: Program): string[] {
  const specifiers: string[] = [];

  const addLiteral = (node: Expression | StringLiteral | null | undefined): void => {
    if (node?.type === 'Literal' && typeof node.value === 'string') {
      specifiers.push(node.value);
    }

    const [onlyPart] =
      node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis : [];

    if (typeof onlyPart?.value.cooked === 'string') {
      specifiers.push(onlyPart.value.cooked);
    }
  };

  const visitor = new oxc.Visitor({
    ImportDeclaration: (node) => {
      addLiteral(node.source);
    },
    ExportNamedDeclaration: (node) => {
      addLiteral(node.source);
    },
    ExportAllDeclaration: (node) => {
      addLiteral(node.source);
    },
    ImportExpression: (node) => {
      addLiteral(node.source);
    },
    TSImportType: (node) => {
      addLiteral(node.source);
    },
    TSExternalModuleReference: (node) => {
      addLiteral(node.expression);
    },
    CallExpression: (node) => {
      const [first] = node.arguments;

      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        first?.type !== 'SpreadElement'
      ) {
        addLiteral(first);
      }
    },
  });

  visitor.visit(program);

  return specifiers;
}
