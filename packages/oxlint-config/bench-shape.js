import { basename } from 'node:path';
import findVariable from './find-variable.js';
import getImportedName from './get-imported-name.js';

const benchFilePattern = /\.bench\.tsx?$/u;

const benchShape = {
  meta: {
    type: 'problem',
    messages: {
      shape:
        "A benchmark file holds one benchmark that `rig bench` runs: write `export default defineBench({ name, budget, run })`, with `defineBench` imported from '@zgeoff/rig/bench'.",
    },
    schema: [],
  },
  create(context) {
    if (!benchFilePattern.test(basename(context.physicalFilename))) {
      return {};
    }

    return {
      Program(program) {
        const defaultExport = program.body.find(
          (statement) => statement.type === 'ExportDefaultDeclaration',
        );

        if (defaultExport !== undefined && isDefineBenchCall(context, defaultExport.declaration)) {
          return;
        }

        if (defaultExport !== undefined) {
          context.report({ node: defaultExport, messageId: 'shape' });

          return;
        }

        const start = program.body[0]?.loc.start ?? { line: 1, column: 0 };

        context.report({ loc: { start, end: start }, messageId: 'shape' });
      },
    };
  },
};

export default benchShape;

const benchModule = '@zgeoff/rig/bench';

function isDefineBenchCall(context, node) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
    return false;
  }

  const definition = findVariable(context, node.callee)?.defs[0];

  return (
    definition?.type === 'ImportBinding' &&
    definition.node.type === 'ImportSpecifier' &&
    definition.parent.source.value === benchModule &&
    getImportedName(definition.node) === 'defineBench'
  );
}
