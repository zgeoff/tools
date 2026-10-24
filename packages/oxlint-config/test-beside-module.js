import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import resolveRepoRoot from './resolve-repo-root.js';

const testFilePattern = /^(?<base>.+)\.test\.tsx?$/u;

const testBesideModule = {
  meta: {
    type: 'problem',
    messages: {
      missing:
        'Move this test beside the module it tests: no `{{name}}.<ext>` sits in this directory. Whole-program suites belong in a root `e2e/` or `evals/` directory.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          lanes: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const lanes = new Set(['browser', ...(context.options[0]?.lanes ?? [])]);

    return {
      Program() {
        const filename = context.physicalFilename;
        const match = testFilePattern.exec(basename(filename));

        if (match === null || probeUnderExemptRoot(context.cwd, filename)) {
          return;
        }

        const name = toModuleName(match.groups.base, lanes);

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

// suites that run the whole program have no single module to sit beside
const exemptRootDirs = new Set(['e2e', 'evals']);

// the repo root, not oxlint's working directory, so a per-package lint
// script neither exempts a package's own e2e/ nor flags the root one
function probeUnderExemptRoot(cwd, filename) {
  const [first] = relative(resolveRepoRoot(filename) ?? cwd, filename).split(sep);

  return exemptRootDirs.has(first);
}

function toModuleName(base, lanes) {
  const dot = base.lastIndexOf('.');

  return dot > 0 && lanes.has(base.slice(dot + 1)) ? base.slice(0, dot) : base;
}

function probeModuleSibling(directory, name) {
  return readdirSync(directory).some((entry) => {
    const dot = entry.lastIndexOf('.');

    return (
      dot > 0 &&
      entry.slice(0, dot) === name &&
      !testFilePattern.test(entry) &&
      probeFile(join(directory, entry))
    );
  });
}

// follows a symlink, so a linked module counts as the file it points at
function probeFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
