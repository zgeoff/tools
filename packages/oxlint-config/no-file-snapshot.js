import { statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import findStaticKey from './find-static-key.js';

const fileMatchers = new Set(['toMatchSnapshot', 'toThrowErrorMatchingSnapshot']);

const noFileSnapshot = {
  meta: {
    type: 'problem',
    messages: {
      matcher:
        'Replace `{{matcher}}` with its inline form: snapshots are inline only, so the golden value sits in the test.',
      file: 'Delete `__snapshots__/{{name}}` and pin its values inline: snapshots are inline only, so the golden value sits in the test.',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        const matcher = findStaticKey(node);

        if (fileMatchers.has(matcher)) {
          context.report({ node: node.property, messageId: 'matcher', data: { matcher } });
        }
      },
      Program() {
        const filename = context.physicalFilename;
        const name = `${basename(filename)}.snap`;

        if (!probeFile(join(dirname(filename), '__snapshots__', name))) {
          return;
        }

        // anchor on the first statement, not offset 0, so a disable comment
        // at the top of the file sits before the report and covers it
        const start = context.sourceCode.ast.body[0]?.loc.start ?? { line: 1, column: 0 };

        context.report({ loc: { start, end: start }, messageId: 'file', data: { name } });
      },
    };
  },
};

function probeFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

export default noFileSnapshot;
