import { readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const seedFilePattern = /^(?<base>seed-.+)\.tsx?$/u;
const skippedPattern = /\.test\.tsx?$|\.d\.ts$/u;

const testBesideSeed = {
  meta: {
    type: 'problem',
    messages: {
      missing:
        'Write `{{base}}.test.ts` beside this seed: it asserts the rows and files the seed writes, and that input overrides apply.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const filename = context.physicalFilename;
        const name = basename(filename);
        const match = seedFilePattern.exec(name);

        if (match === null || skippedPattern.test(name)) {
          return;
        }

        const base = match.groups.base;

        if (probeSeedTest(dirname(filename), base)) {
          return;
        }

        // anchor on the first statement, as test-beside-module does, so a disable comment at the
        // top of the file covers the report
        const start = context.sourceCode.ast.body[0]?.loc.start ?? { line: 1, column: 0 };

        context.report({ loc: { start, end: start }, messageId: 'missing', data: { base } });
      },
    };
  },
};

export default testBesideSeed;

// a lane suite of the seed, such as `seed-note.host.test.ts`, counts as its test
function probeSeedTest(directory, base) {
  return readdirSync(directory).some(
    (entry) => entry.startsWith(`${base}.`) && /\.test\.tsx?$/u.test(entry),
  );
}
