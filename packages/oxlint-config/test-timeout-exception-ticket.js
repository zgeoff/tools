const testTimeoutExceptionTicket = {
  meta: {
    type: 'problem',
    messages: {
      ticket:
        'This comment disables zgeoff/max-test-timeout with no ticket and no `floor:` after `--`. Give the measured time and the ticket that tracks the fix, or `floor:` and the evidence that the time cannot move, as the "Slow tests" section of the testing skill shows.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (isTicketlessDisable(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'ticket' });
          }
        }
      },
    };
  },
};

export default testTimeoutExceptionTicket;

const directivePattern = /^(?:oxlint|eslint)-disable(?:-next-line|-line)?(?=\s|$)/u;

const ticketPattern = /\b[A-Z][A-Z0-9]*-\d+\b/u;

// a block comment's continuation stars are no evidence
const floorPattern = /\bfloor:[\s*]*[^\s*]/u;

const ruleName = 'zgeoff/max-test-timeout';

// a directive's rule names end at a `--` that whitespace precedes, and its reason follows
function isTicketlessDisable(comment) {
  const body = comment.trim();
  const name = directivePattern.exec(body);

  if (name === null) {
    return false;
  }

  const rest = body.slice(name[0].length);
  const separator = /\s--/u.exec(rest);
  const rules = (separator === null ? rest : rest.slice(0, separator.index)).split(/[\s,]+/u);
  const reason = separator === null ? '' : rest.slice(separator.index + separator[0].length);

  return rules.includes(ruleName) && !ticketPattern.test(reason) && !floorPattern.test(reason);
}
