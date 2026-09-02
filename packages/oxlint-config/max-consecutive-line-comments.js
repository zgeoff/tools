// tool directives are not prose: they neither count toward a run nor join
// the prose on either side of them into one
const directivePattern =
  /^\s*(?:oxlint-|eslint-|@ts-|prettier-|oxfmt-|biome-ignore|#region|#endregion|\/\s*<)/u;

function isOwnLine(text, comment) {
  const lineStart = text.lastIndexOf('\n', comment.range[0] - 1) + 1;

  return /^[ \t]*$/u.test(text.slice(lineStart, comment.range[0]));
}

function isProseLine(text, comment) {
  return (
    comment.type === 'Line' && !directivePattern.test(comment.value) && isOwnLine(text, comment)
  );
}

// a run is prose line comments on consecutive lines; whatever else occupies
// a line between two of them (code, a blank, a directive, a block comment)
// breaks adjacency and so ends the run
function collectRuns(text, comments) {
  const runs = [];

  for (const comment of comments.filter((candidate) => isProseLine(text, candidate))) {
    const run = runs.at(-1);

    if (run !== undefined && comment.loc.start.line === run.at(-1).loc.end.line + 1) {
      run.push(comment);
    } else {
      runs.push([comment]);
    }
  }

  return runs;
}

const maxConsecutiveLineComments = {
  meta: {
    type: 'suggestion',
    messages: {
      tooLong:
        'This comment run is {{count}} lines; the limit is {{max}}. Cut it to the fact the code cannot show, or move it into a test name or the subsystem doc.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const max = context.options[0]?.max ?? 3;

    return {
      Program() {
        const text = context.sourceCode.text;
        const runs = collectRuns(text, context.sourceCode.getAllComments());

        for (const run of runs) {
          if (run.length > max) {
            context.report({
              loc: { start: run[0].loc.start, end: run.at(-1).loc.end },
              messageId: 'tooLong',
              data: { count: String(run.length), max: String(max) },
            });
          }
        }
      },
    };
  },
};

export default maxConsecutiveLineComments;
