export default function findChainRoot(node, isThroughCalls) {
  let current = node;

  for (;;) {
    if (current.type === 'MemberExpression') {
      current = current.object;
    } else if (isThroughCalls && current.type === 'CallExpression') {
      current = current.callee;
    } else {
      return current.type === 'Identifier' ? current : null;
    }
  }
}
