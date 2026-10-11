import { readdirSync } from 'node:fs';
import { basename, dirname, relative, sep } from 'node:path';

const testFilePattern = /^(?<base>.+)\.test\.tsx?$/u;

// suites that run the whole program have no single module to sit beside
const exemptRootDirs = new Set(['e2e', 'evals']);

function isUnderExemptRoot(cwd, filename) {
  const [first] = relative(cwd, filename).split(sep);

  return exemptRootDirs.has(first);
}

// a module is `<name>.<ext>` with a single-segment extension, so another
// test (`<name>.test.ts`) or a declaration file never stands in for one
function hasModuleSibling(dir, name) {
  return readdirSync(dir, { withFileTypes: true }).some((entry) => {
    if (!entry.isFile()) {
      return false;
    }

    const dot = entry.name.lastIndexOf('.');

    return dot > 0 && entry.name.slice(0, dot) === name;
  });
}

const testBesideModule = {
  meta: {
    type: 'problem',
    messages: {
      missing:
        'Move this test beside the module it tests: no `{{name}}.<ext>` sits in this directory. Whole-program suites belong in a root `e2e/` or `evals/` directory.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const filename = context.physicalFilename;
        const match = testFilePattern.exec(basename(filename));

        if (match === null || isUnderExemptRoot(context.cwd, filename)) {
          return;
        }

        const name = match.groups.base;

        if (hasModuleSibling(dirname(filename), name)) {
          return;
        }

        // anchor on the first statement, not offset 0, so a disable comment
        // at the top of the file sits before the report and covers it
        const start = context.sourceCode.ast.body[0]?.loc.start ?? { line: 1, column: 0 };

        context.report({
          loc: { start, end: start },
          messageId: 'missing',
          data: { name },
        });
      },
    };
  },
};

export default testBesideModule;
