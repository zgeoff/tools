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

        // a disable comment at the top of the file sits above the first statement, so it covers the
        // report there
        const start = context.sourceCode.ast.body[0]?.loc.start ?? { line: 1, column: 0 };

        context.report({ loc: { start, end: start }, messageId: 'missing', data: { base } });
      },
    };
  },
};

export default testBesideSeed;

function probeSeedTest(directory, base) {
  return readdirSync(directory).some(
    (entry) => entry.startsWith(`${base}.`) && /\.test\.tsx?$/u.test(entry),
  );
}
