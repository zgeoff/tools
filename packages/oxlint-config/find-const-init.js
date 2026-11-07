import findVariable from './find-variable.js';

export default function findConstInit(context, identifier) {
  const definition = findVariable(context, identifier)?.defs[0];

  if (
    definition?.type !== 'Variable' ||
    definition.parent.kind !== 'const' ||
    definition.node.id.type !== 'Identifier'
  ) {
    return null;
  }

  return definition.node.init;
}
