const valueGlobals = new Set(['undefined', 'NaN', 'Infinity']);

const valueConstructors = new Set(['Set', 'Map', 'WeakSet', 'WeakMap', 'RegExp']);

// a function value is made, not run, so its body never counts
const checks = {
  Literal: () => true,
  FunctionExpression: () => true,
  ArrowFunctionExpression: () => true,
  Identifier: (value, names, canCopyImport) =>
    (valueGlobals.has(value.name) && !names.locals.has(value.name)) ||
    (canCopyImport && names.imports.has(value.name)),
  TemplateLiteral: (value, names) =>
    value.expressions.every((expression) => isPrimitiveValue(expression, names)),
  ArrayExpression: (value, names) =>
    value.elements.every((element) => element === null || isStaticElement(element, names)),
  ObjectExpression: (value, names) =>
    value.properties.every((property) => isStaticProperty(property, names)),
  UnaryExpression: (value, names) =>
    value.operator !== 'delete' && isPrimitiveValue(value.argument, names),
  BinaryExpression: (value, names) =>
    isPrimitiveValue(value.left, names) && isPrimitiveValue(value.right, names),
  LogicalExpression: (value, names, canCopyImport) =>
    isStaticValue(value.left, names, canCopyImport) &&
    isStaticValue(value.right, names, canCopyImport),
  ConditionalExpression: (value, names, canCopyImport) =>
    isStaticValue(value.test, names, false) &&
    isStaticValue(value.consequent, names, canCopyImport) &&
    isStaticValue(value.alternate, names, canCopyImport),
  NewExpression: (value, names) =>
    value.callee.type === 'Identifier' &&
    valueConstructors.has(value.callee.name) &&
    !names.locals.has(value.callee.name) &&
    value.arguments.every((argument) => isStaticArgument(argument, names)),
};

// a value that runs no code and reads nothing that load-time code can change,
// so it is the same wherever it sits; an import stands only where its value
// is copied, such as an array element, and never where it is read through
export default function isStaticValue(node, names, canCopyImport = true) {
  const value = unwrapExpression(node);
  const check = checks[value.type];

  return check === undefined ? false : check(value, names, canCopyImport);
}

const wrapperTypes = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
]);

// a type assertion or parentheses leave the value as it is
function unwrapExpression(node) {
  let current = node;

  while (wrapperTypes.has(current.type)) {
    current = current.expression;
  }

  return current;
}

const primitiveTypes = new Set([
  'Literal',
  'Identifier',
  'TemplateLiteral',
  'UnaryExpression',
  'BinaryExpression',
]);

// an operator or a template turns an object into a primitive through its
// `valueOf` or `toString`, which can read anything, so it takes only values
// that are primitive already
function isPrimitiveValue(node, names) {
  const value = unwrapExpression(node);

  return primitiveTypes.has(value.type) && isStaticValue(value, names, false);
}

function isStaticElement(element, names) {
  return element.type === 'SpreadElement'
    ? isLiteralSpread(element, names)
    : isStaticValue(element, names);
}

// a spread runs an iterator or reads properties, so it spreads only a literal
function isLiteralSpread(element, names) {
  const argument = element.type === 'SpreadElement' ? unwrapExpression(element.argument) : null;

  return (
    argument !== null &&
    (argument.type === 'ArrayExpression' || argument.type === 'ObjectExpression') &&
    isStaticValue(argument, names)
  );
}

function isStaticProperty(property, names) {
  if (property.type === 'SpreadElement') {
    return isLiteralSpread(property, names);
  }

  return (
    (!property.computed || isStaticValue(property.key, names, false)) &&
    isStaticValue(property.value, names)
  );
}

// a constructor reads through its arguments, so an import never stands there
function isStaticArgument(argument, names) {
  return argument.type === 'SpreadElement'
    ? isLiteralSpread(argument, names)
    : isStaticValue(argument, names, false);
}
