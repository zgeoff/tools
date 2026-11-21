import { basename, relative } from 'node:path';
import isInTestUtils from './is-in-test-utils.js';
import readPackageManifest from './read-package-manifest.js';
import readTestingKitExports from './read-testing-kit-exports.js';
import resolvePackageDirectory from './resolve-package-directory.js';
import resolveRepoRoot from './resolve-repo-root.js';

const testFilePattern = /\.test\.tsx?$/u;

const useTestingKit = {
  meta: {
    type: 'problem',
    messages: {
      duplicate: '{{name}} is exported by {{specifier}}; import it from there',
      setupServer: 'use `createTestNetwork` from `@zgeoff/testing/fetch`',
      interceptors: 'use `createTestNetwork` from `@zgeoff/testing/fetch`',
    },
    schema: [],
  },
  create(context) {
    const filename = context.physicalFilename;
    const root = resolveRepoRoot(filename) ?? context.cwd;
    const kitNames = readTestingKitExports(filename);

    // a kit file is where each export lives, so the kit's own source never counts as a copy
    if (kitNames === null || readIsTestingKitSource(filename, root)) {
      return {};
    }

    const isTestCode =
      testFilePattern.test(basename(filename)) || isInTestUtils(relative(root, filename));

    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        if (source === '@mswjs/interceptors/fetch') {
          context.report({ node, messageId: 'interceptors' });
        }

        if (source === 'msw/node') {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              specifier.importKind !== 'type' &&
              (specifier.imported.name ?? specifier.imported.value) === 'setupServer'
            ) {
              context.report({ node: specifier, messageId: 'setupServer' });
            }
          }
        }
      },
      FunctionDeclaration(node) {
        if (isTestCode) {
          reportDuplicate(context, kitNames, node.id);
        }
      },
      VariableDeclarator(node) {
        if (isTestCode && isFunctionValue(node.init)) {
          reportDuplicate(context, kitNames, node.id);
        }
      },
    };
  },
};

export default useTestingKit;

function readIsTestingKitSource(filename, root) {
  const directory = resolvePackageDirectory(filename, root);

  return directory !== null && readPackageManifest(directory).name === '@zgeoff/testing';
}

const capitalPattern = /\p{Lu}/u;

function reportDuplicate(context, kitNames, identifier) {
  const name = identifier?.type === 'Identifier' ? identifier.name : null;

  if (name !== null && capitalPattern.test(name) && kitNames.has(name)) {
    context.report({
      node: identifier,
      messageId: 'duplicate',
      data: { name, specifier: kitNames.get(name) },
    });
  }
}

function isFunctionValue(node) {
  return (
    node !== null &&
    node !== undefined &&
    (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')
  );
}
