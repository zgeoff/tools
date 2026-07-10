// Custom lint rules, loaded through oxlint's jsPlugins (ESLint v9 rule API).
// Each rule bans a shape no native oxlint rule can express — esquery selectors
// for AST shapes, a source-comment scan where the target isn't
// esquery-selectable.

function banSelectors(type, message, selectors) {
  return {
    meta: { type, messages: { banned: message }, schema: [] },
    create(context) {
      const entries = selectors.map((selector) => [
        selector,
        (node) => context.report({ node, messageId: 'banned' }),
      ]);

      return Object.fromEntries(entries);
    },
  };
}

// mirrors eslint-plugin-jsdoc's default singleLineTags: blocks that exist to
// cast inline (`/** @type {Foo} */ (bar)`) stay single-line by design
const inlineTagPattern = /^@(?:type|lends)\b/u;

function isSingleLineJSDoc(comment) {
  return (
    comment.type === 'Block' &&
    comment.value.startsWith('*') &&
    comment.loc.start.line === comment.loc.end.line
  );
}

/**
 * Builds the multi-line replacement for a single-line JSDoc comment, or null
 * when the comment shares its line with code — expanding those in place would
 * scramble the surrounding statement, so they are reported without a fix.
 */
function planExpansion(text, comment) {
  if (!isOwnLine(text, comment)) {
    return null;
  }

  const lineStart = text.lastIndexOf('\n', comment.range[0] - 1) + 1;
  const indent = text.slice(lineStart, comment.range[0]);
  const body = comment.value.slice(1).trim();
  const bodyLine = body === '' ? `${indent} *` : `${indent} * ${body}`;

  return `/**\n${bodyLine}\n${indent} */`;
}

function isOwnLine(text, comment) {
  const [start, end] = comment.range;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const sliceEnd = lineEnd === -1 ? text.length : lineEnd;

  return /^[ \t]*$/u.test(text.slice(lineStart, start)) && text.slice(end, sliceEnd).trim() === '';
}

const noSingleLineJSDoc = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      singleLine:
        'Write JSDoc blocks multi-line: `/**` alone, one `*`-prefixed line per point, `*/` alone.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const offenders = context.sourceCode
          .getAllComments()
          .filter(
            (comment) =>
              isSingleLineJSDoc(comment) && !inlineTagPattern.test(comment.value.slice(1).trim()),
          );

        for (const comment of offenders) {
          const replacement = planExpansion(context.sourceCode.text, comment);

          context.report({
            loc: comment.loc,
            messageId: 'singleLine',
            fix:
              replacement === null
                ? undefined
                : (fixer) => fixer.replaceTextRange(comment.range, replacement),
          });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: 'zgeoff' },
  rules: {
    'no-top-level-arrow': banSelectors(
      'problem',
      'Declare top-level functions with the `function` keyword instead of assigning an arrow function.',
      [
        "Program > VariableDeclaration > VariableDeclarator[init.type='ArrowFunctionExpression']",
        "Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[init.type='ArrowFunctionExpression']",
        'Program > ExportDefaultDeclaration > ArrowFunctionExpression',
        "Program > ExpressionStatement > AssignmentExpression[right.type='ArrowFunctionExpression']",
      ],
    ),
    'no-nested-function-declaration': banSelectors(
      'problem',
      'Use an arrow function here; reserve the `function` keyword for top-level declarations.',
      [
        'FunctionDeclaration:not(Program > FunctionDeclaration):not(Program > ExportNamedDeclaration > FunctionDeclaration):not(Program > ExportDefaultDeclaration > FunctionDeclaration)',
      ],
    ),
    'no-bare-named-exports': banSelectors(
      'problem',
      'Export declarations inline instead of listing names in `export { ... }`.',
      ['ExportNamedDeclaration[specifiers.length>0][declaration=null][source=null]'],
    ),
    'no-inline-param-object-types': banSelectors(
      'problem',
      'Give this parameter a named interface or type alias instead of an inline object-literal type.',
      [
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSFunctionType) > Identifier.params > TSTypeAnnotation > TSTypeLiteral',
        'TSMethodSignature > Identifier.params > TSTypeAnnotation > TSTypeLiteral',
      ],
    ),
    'no-destructured-params': banSelectors(
      'suggestion',
      'Accept the parameter whole instead of destructuring it in the signature.',
      [
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > ObjectPattern.params',
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > AssignmentPattern.params > ObjectPattern',
      ],
    ),
    'no-pick-destructuring': banSelectors(
      'suggestion',
      'Use direct member access; destructure an object only with a rest element to omit properties.',
      ['VariableDeclarator > ObjectPattern:not(:has(> RestElement))'],
    ),
    'no-ternary-args': banSelectors(
      'suggestion',
      'Extract this ternary to a named const instead of passing it as an argument.',
      [
        'CallExpression > ConditionalExpression.arguments',
        'NewExpression > ConditionalExpression.arguments',
      ],
    ),
    'no-await-args': banSelectors(
      'suggestion',
      'Await into a named const instead of awaiting inside an argument list.',
      ['CallExpression > AwaitExpression.arguments', 'NewExpression > AwaitExpression.arguments'],
    ),
    'no-await-in-condition': banSelectors(
      'suggestion',
      'Await into a named const before the statement instead of inside a control-flow condition.',
      [
        ':matches(IfStatement, WhileStatement, DoWhileStatement, ForStatement, ConditionalExpression) > AwaitExpression.test',
        'SwitchStatement > AwaitExpression.discriminant',
      ],
    ),
    'no-await-in-logical': banSelectors(
      'suggestion',
      'Await into a named const instead of chaining it after a && / || / ?? operator.',
      ['LogicalExpression > AwaitExpression'],
    ),
    'no-single-line-jsdoc': noSingleLineJSDoc,
  },
};

export default plugin;
