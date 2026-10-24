export default function collectTypeKinds(
  type,
  localTypes,
  resolvePromise = false,
  seen = new Set(),
) {
  if (type.type === 'TSUnionType') {
    return type.types.flatMap((member) =>
      collectTypeKinds(member, localTypes, resolvePromise, seen),
    );
  }

  if (type.type === 'TSParenthesizedType' || isReadonlyOperator(type)) {
    return collectTypeKinds(type.typeAnnotation, localTypes, resolvePromise, seen);
  }

  if (type.type !== 'TSTypeReference') {
    return [pickTypeKind(type)];
  }

  const name = type.typeName.type === 'Identifier' ? type.typeName.name : null;
  const alias = name === null ? undefined : localTypes.aliases.get(name);

  if (alias !== undefined && !seen.has(name)) {
    return collectTypeKinds(alias, localTypes, resolvePromise, new Set([...seen, name]));
  }

  const typeArguments = type.typeArguments ?? type.typeParameters;

  if (resolvePromise && name === 'Promise' && typeArguments?.params.length === 1) {
    const [value] = typeArguments.params;

    return collectTypeKinds(value, localTypes, resolvePromise, seen);
  }

  // an interface never holds null; any other reference, such as an import or
  // a type parameter, is a type the rule cannot read
  return [localTypes.interfaces.has(name) ? 'value' : 'open'];
}

function isReadonlyOperator(type) {
  return type.type === 'TSTypeOperator' && type.operator === 'readonly';
}

const valueTypes = new Set([
  'TSStringKeyword',
  'TSNumberKeyword',
  'TSBigIntKeyword',
  'TSSymbolKeyword',
  'TSObjectKeyword',
  'TSNeverKeyword',
  'TSLiteralType',
  'TSTemplateLiteralType',
  'TSArrayType',
  'TSTupleType',
  'TSTypeLiteral',
  'TSFunctionType',
  'TSConstructorType',
]);

function pickTypeKind(type) {
  if (
    type.type === 'TSBooleanKeyword' ||
    (type.type === 'TSTypePredicate' && !type.asserts) ||
    (type.type === 'TSLiteralType' && typeof type.literal.value === 'boolean')
  ) {
    return 'boolean';
  }

  if (type.type === 'TSNullKeyword' || type.type === 'TSUndefinedKeyword') {
    return 'nullish';
  }

  if (type.type === 'TSVoidKeyword') {
    return 'void';
  }

  // `asserts value is T` throws instead of returning a boolean
  if (type.type === 'TSTypePredicate' || valueTypes.has(type.type)) {
    return 'value';
  }

  return 'open';
}
