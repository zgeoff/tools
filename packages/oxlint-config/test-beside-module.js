import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import resolveRepoRoot from './resolve-repo-root.js';

// a browser suite (`<name>.browser.test.ts`) tests the same module as
// `<name>.test.ts`, and the suffix lets a runner put it in its own lane
const testFilePattern = /^(?<base>.+?)(?:\.browser)?\.test\.tsx?$/u;

// suites that run the whole program have no single module to sit beside
const exemptRootDirs = new Set(['e2e', 'evals']);

// the repo root, not oxlint's working directory, so a per-package lint
// script neither exempts a package's own e2e/ nor flags the root one
function isUnderExemptRoot(cwd, filename) {
  const [first] = relative(resolveRepoRoot(filename) ?? cwd, filename).split(sep);

  return exemptRootDirs.has(first);
}

// a module is `<name>.<ext>` with a single-segment extension, so a
// declaration file never stands in for one, and neither does another test
// (`foo.test.ts` beside `foo.test.test.ts`)
function probeModuleSibling(dir, name) {
  return readdirSync(dir).some((entry) => {
    const dot = entry.lastIndexOf('.');

    return (
      dot > 0 &&
      entry.slice(0, dot) === name &&
      !testFilePattern.test(entry) &&
      probeFile(join(dir, entry))
    );
  });
}

// follows a symlink, so a linked module counts as the file it points at
function probeFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
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

        if (probeModuleSibling(dirname(filename), name)) {
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
