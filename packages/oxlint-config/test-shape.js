import { basename } from 'node:path';
import bannedTestCalls from './banned-test-calls.js';
import findBunTestName from './find-bun-test-name.js';
import findChainRoot from './find-chain-root.js';
import getImportedName from './get-imported-name.js';
import isBunTestFile from './is-bun-test-file.js';

const testFilePattern = /\.test\.tsx?$/u;

const testShape = {
  meta: {
    type: 'problem',
    messages: {
      describe: 'Write each test as a top-level `test()` call; `describe` is banned.',
      it: 'Write each test as a `test()` call; `it`, the alias Bun gives `test`, is banned.',
      hook: 'Put per-test setup in `setupTest()` and cleanup in `onTestFinished()`; `{{name}}` is banned.',
      rename:
        'Import each `bun:test` binding by its own name, so the test-shape checks see each call.',
      title: 'Start a test title with `it ` or with a `#<unit> ` prefix.',
      toEqual: 'Use `toStrictEqual`, or `toMatchObject` for a partial match; `toEqual` is banned.',
    },
    schema: [],
  },
  create(context) {
    if (
      !testFilePattern.test(basename(context.physicalFilename)) ||
      !isBunTestFile(context.sourceCode.ast)
    ) {
      return {};
    }

    return {
      CallExpression(node) {
        emitCallShape(context, node);
      },
      "MemberExpression[computed=false][property.name='toEqual']"(node) {
        if (isBunTestRoot(context, node.object, 'expect')) {
          context.report({ node: node.property, messageId: 'toEqual' });
        }
      },
      "ImportDeclaration[source.value='bun:test'][importKind!='type']"(node) {
        for (const specifier of node.specifiers) {
          if (isRenamed(specifier)) {
            context.report({ node: specifier, messageId: 'rename' });
          }
        }
      },
    };
  },
};

export default testShape;

// a unit may be a dotted path, such as #sessions.enrol
const titlePattern = /^(?:it |#\w+(?:\.\w+)* )/u;

function emitCallShape(context, node) {
  const callee = node.callee;
  const root = callee.type === 'CallExpression' ? null : findChainRoot(callee, false);
  const name = root === null ? null : findBunTestName(context, root);

  if (bannedTestCalls.has(name)) {
    const messageId = name === 'describe' || name === 'it' ? name : 'hook';

    context.report({ node, messageId, data: { name } });

    return;
  }

  if (!isBunTestRoot(context, callee, 'test')) {
    return;
  }

  const [titleNode] = node.arguments;
  const title = findTitleStart(titleNode);

  if (title !== null && !titlePattern.test(title)) {
    context.report({ node: titleNode, messageId: 'title' });
  }
}

function isBunTestRoot(context, node, name) {
  const root = findChainRoot(node, true);

  return root !== null && findBunTestName(context, root) === name;
}

function findTitleStart(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral') {
    return node.quasis[0].value.cooked ?? '';
  }

  return null;
}

function isRenamed(specifier) {
  if (specifier.type === 'ImportNamespaceSpecifier') {
    return true;
  }

  return (
    specifier.type === 'ImportSpecifier' &&
    specifier.importKind !== 'type' &&
    getImportedName(specifier) !== specifier.local.name
  );
}
