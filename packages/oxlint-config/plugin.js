import functionVerb from './function-verb.js';
import importZones from './import-zones.js';
import maxConsecutiveLineComments from './max-consecutive-line-comments.js';
import buildMaxTestTimeout from './max-test-timeout.js';
import moduleOrder from './module-order.js';
import noAbbreviatedNames from './no-abbreviated-names.js';
import noClass from './no-class.js';
import noCommentRuleOverride from './no-comment-rule-override.js';
import noFileSnapshot from './no-file-snapshot.js';
import noHiddenCast from './no-hidden-cast.js';
import noJSDoc from './no-jsdoc.js';
import noRequire from './no-require.js';
import noRestrictedWords from './no-restricted-words.js';
import noTestSleep from './no-test-sleep.js';
import readRigLanes from './read-rig-lanes.js';
import resolveRepoRoot from './resolve-repo-root.js';
import setupTestOnly from './setup-test-only.js';
import buildTestBesideModule from './test-beside-module.js';
import testShape from './test-shape.js';
import testTimeoutExceptionTicket from './test-timeout-exception-ticket.js';
import verbContract from './verb-contract.js';

// A repo with a rig.config.ts takes its lane limits from it, read once when oxlint loads the plugin.
const rigLanes = await readRigLanes(process.cwd());

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
    'no-switch': buildBanRule(
      'problem',
      'Branch with match(...).exhaustive() from ts-pattern, never switch.',
      ['SwitchStatement'],
    ),
    'no-class': noClass,
    'no-hidden-cast': noHiddenCast,
    'no-jsdoc': noJSDoc,
    'max-consecutive-line-comments': maxConsecutiveLineComments,
    'no-comment-rule-override': noCommentRuleOverride,
    'function-verb': functionVerb,
    'verb-contract': verbContract,
    'module-order': moduleOrder,
    'no-restricted-words': noRestrictedWords,
    'no-abbreviated-names': noAbbreviatedNames,
    'test-beside-module': buildTestBesideModule(rigLanes),
    'no-file-snapshot': noFileSnapshot,
    'setup-test-only': setupTestOnly,
    'max-test-timeout': buildMaxTestTimeout(resolveRepoRoot, rigLanes),
    'test-timeout-exception-ticket': testTimeoutExceptionTicket,
    'no-test-sleep': noTestSleep,
    'no-require': noRequire,
    'test-shape': testShape,
    'import-zones': importZones,
  },
};

export default plugin;

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
