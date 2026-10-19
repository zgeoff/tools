// a custom error stays a class, since `instanceof` checks and stack traces
// need one: its superclass is `Error` or another name that ends in `Error`,
// bare or as a member such as `errors.BrewError`
const errorNamePattern = /Error$/u;

const noClass = {
  meta: {
    type: 'problem',
    messages: {
      banned:
        'Build this with a factory function (`create<X>` or `make<X>`), not a class. Only a custom error may be a class: `class XError extends Error`.',
    },
    schema: [],
  },
  create(context) {
    const checkClass = (node) => {
      if (!isCustomError(node)) {
        context.report({ node, messageId: 'banned' });
      }
    };

    return { ClassDeclaration: checkClass, ClassExpression: checkClass };
  },
};

function isCustomError(node) {
  return errorNamePattern.test(getSuperName(node.superClass));
}

function getSuperName(superClass) {
  if (superClass?.type === 'Identifier') {
    return superClass.name;
  }

  if (superClass?.type === 'MemberExpression' && !superClass.computed) {
    return superClass.property.name;
  }

  return '';
}

export default noClass;
