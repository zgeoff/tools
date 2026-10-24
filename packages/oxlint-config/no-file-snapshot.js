import { statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const fileMatchers = ['toMatchSnapshot', 'toThrowErrorMatchingSnapshot'];

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
    const entries = fileMatchers
      .flatMap((matcher) => [
        `MemberExpression[computed=false] > Identifier.property[name='${matcher}']`,
        `MemberExpression[computed=true] > Literal.property[value='${matcher}']`,
      ])
      .map((selector) => [
        selector,
        (node) =>
          context.report({ node, messageId: 'matcher', data: { matcher: getMatcherName(node) } }),
      ]);

    return {
      ...Object.fromEntries(entries),
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

function getMatcherName(node) {
  return node.type === 'Identifier' ? node.name : node.value;
}

function probeFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

export default noFileSnapshot;
