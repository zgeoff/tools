const noRestrictedWords = {
  meta: {
    type: 'problem',
    messages: {
      restricted:
        'Remove `{{word}}` from this {{place}}: the repo config restricts the word in this path.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          words: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const words = context.options[0]?.words ?? [];

    if (words.length === 0) {
      return {};
    }

    const pattern = buildWordPattern(words);

    const checkText = (node, text, place) => {
      for (const match of text.matchAll(pattern)) {
        context.report({ node, messageId: 'restricted', data: { word: match[0], place } });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkText(node, node.value, 'string');
        }
      },
      TemplateElement(node) {
        checkText(node, node.value.cooked ?? node.value.raw, 'template');
      },
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          checkText(comment, comment.value, 'comment');
        }
      },
    };
  },
};

// a letter, digit or underscore on either side makes the match part of a
// longer word (`impl`, `simple`), so only those characters bound it
function buildWordPattern(words) {
  const alternatives = words.map((word) =>
    word.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`),
  );

  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}

export default noRestrictedWords;
