// mirrors eslint-plugin-jsdoc's default singleLineTags: a block that exists to
// cast inline (`/** @type {Foo} */ (bar)`) is a type annotation, not prose
const inlineTagPattern = /^@(?:type|lends)\b/u;

function isJSDoc(comment) {
  return comment.type === 'Block' && comment.value.startsWith('*');
}

function isInlineCast(comment) {
  return (
    comment.loc.start.line === comment.loc.end.line &&
    inlineTagPattern.test(comment.value.slice(1).trim())
  );
}

const noJSDoc = {
  meta: {
    type: 'suggestion',
    messages: {
      jsdoc:
        'Delete this JSDoc block. A rule a caller must respect is a test whose name states it or a sentence in the subsystem doc; the reason a line does the non-obvious thing is a `//` at that line.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const offenders = context.sourceCode
          .getAllComments()
          .filter((comment) => isJSDoc(comment) && !isInlineCast(comment));

        for (const comment of offenders) {
          context.report({ loc: comment.loc, messageId: 'jsdoc' });
        }
      },
    };
  },
};

export default noJSDoc;
