import functionVerb from './function-verb.js';
import maxConsecutiveLineComments from './max-consecutive-line-comments.js';
import noJSDoc from './no-jsdoc.js';

// custom rules loaded through oxlint's jsPlugins (ESLint v9 rule API): each
// bans a shape no native oxlint rule can express, as an esquery selector or a
// source-comment scan

function buildBanRule(type, message, selectors) {
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

const plugin = {
  meta: { name: 'zgeoff' },
  rules: {
    'no-top-level-arrow': buildBanRule(
      'problem',
      'Declare top-level functions with the `function` keyword instead of assigning an arrow function.',
      [
        "Program > VariableDeclaration > VariableDeclarator[init.type='ArrowFunctionExpression']",
        "Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[init.type='ArrowFunctionExpression']",
        'Program > ExportDefaultDeclaration > ArrowFunctionExpression',
        "Program > ExpressionStatement > AssignmentExpression[right.type='ArrowFunctionExpression']",
      ],
    ),
    'no-nested-function-declaration': buildBanRule(
      'problem',
      'Use an arrow function here; reserve the `function` keyword for top-level declarations.',
      [
        'FunctionDeclaration:not(Program > FunctionDeclaration):not(Program > ExportNamedDeclaration > FunctionDeclaration):not(Program > ExportDefaultDeclaration > FunctionDeclaration)',
      ],
    ),
    'no-bare-named-exports': buildBanRule(
      'problem',
      'Export declarations inline instead of listing names in `export { ... }`.',
      ['ExportNamedDeclaration[specifiers.length>0][declaration=null][source=null]'],
    ),
    'no-inline-param-object-types': buildBanRule(
      'problem',
      'Give this parameter a named interface or type alias instead of an inline object-literal type.',
      [
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSFunctionType) > Identifier.params > TSTypeAnnotation > TSTypeLiteral',
        'TSMethodSignature > Identifier.params > TSTypeAnnotation > TSTypeLiteral',
      ],
    ),
    'no-destructured-params': buildBanRule(
      'suggestion',
      'Accept the parameter whole instead of destructuring it in the signature.',
      [
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > ObjectPattern.params',
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > AssignmentPattern.params > ObjectPattern',
      ],
    ),
    'no-pick-destructuring': buildBanRule(
      'suggestion',
      'Use direct member access; destructure an object only with a rest element to omit properties.',
      ['VariableDeclarator > ObjectPattern:not(:has(> RestElement))'],
    ),
    'no-ternary-args': buildBanRule(
      'suggestion',
      'Extract this ternary to a named const instead of passing it as an argument.',
      [
        'CallExpression > ConditionalExpression.arguments',
        'NewExpression > ConditionalExpression.arguments',
      ],
    ),
    'no-await-args': buildBanRule(
      'suggestion',
      'Await into a named const instead of awaiting inside an argument list.',
      ['CallExpression > AwaitExpression.arguments', 'NewExpression > AwaitExpression.arguments'],
    ),
    'no-await-in-condition': buildBanRule(
      'suggestion',
      'Await into a named const before the statement instead of inside a control-flow condition.',
      [
        ':matches(IfStatement, WhileStatement, DoWhileStatement, ForStatement, ConditionalExpression) > AwaitExpression.test',
        'SwitchStatement > AwaitExpression.discriminant',
      ],
    ),
    'no-await-in-logical': buildBanRule(
      'suggestion',
      'Await into a named const instead of chaining it after a && / || / ?? operator.',
      ['LogicalExpression > AwaitExpression'],
    ),
    'no-jsdoc': noJSDoc,
    'max-consecutive-line-comments': maxConsecutiveLineComments,
    'function-verb': functionVerb,
  },
};

export default plugin;
