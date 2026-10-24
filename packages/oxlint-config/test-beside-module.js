import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import buildLaneLimits from './build-lane-limits.js';
import resolveRepoRoot from './resolve-repo-root.js';
import resolveSuiteDirectory from './resolve-suite-directory.js';

const testFilePattern = /^(?<base>.+)\.test\.tsx?$/u;

const testBesideModule = {
  meta: {
    type: 'problem',
    messages: {
      missing:
        'Move this test beside the module it tests: no `{{name}}.<ext>` sits in this directory. A flow across several packages belongs in `integration/`, and a test that drives the built product in `e2e/`, at the repo root or an app root.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          lanes: {
            anyOf: [
              { type: 'array', items: { type: 'string' } },
              { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
            ],
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const lanes = buildLaneLimits(context.options[0]?.lanes);

    return {
      Program() {
        const filename = context.physicalFilename;
        const match = testFilePattern.exec(basename(filename));

        if (
          match === null ||
          resolveSuiteDirectory(resolveRepoRoot(filename) ?? context.cwd, filename) !== null
        ) {
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
