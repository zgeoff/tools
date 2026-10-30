export default function findStaticKey(member) {
  const property = member.property;

  if (!member.computed) {
    return property.type === 'Identifier' ? property.name : null;
  }

  if (property.type === 'Literal' && typeof property.value === 'string') {
    return property.value;
  }

  if (property.type === 'TemplateLiteral' && property.expressions.length === 0) {
    return property.quasis[0].value.cooked;
  }

  return null;
}
