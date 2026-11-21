import type {
  AttributeValue,
  ElementNode,
  IDReference,
  StoryNode,
  TokenReference,
} from '../types.ts';

type PropValue = AttributeValue | StoryNode | undefined;

// The tree keeps each text as it is. The build escapes it once, when it writes the string.
export function buildElement(
  tag: string,
  attributes: Readonly<Record<string, AttributeValue | undefined>>,
  children: StoryNode,
): ElementNode {
  return { node: 'element', tag, attributes, children: [children] };
}

export function toElement(tag: string, props: Readonly<Record<string, PropValue>>): ElementNode {
  const attributes: Record<string, AttributeValue | undefined> = {};
  let children: StoryNode = null;

  for (const [name, value] of Object.entries(props)) {
    if (name === 'children') {
      children = isReferenceValue(value) ? null : value;
    } else if (isAttributeValue(value) || value === undefined) {
      attributes[name] = value;
    }
  }

  return buildElement(tag, attributes, children);
}

function isAttributeValue(value: PropValue): value is AttributeValue {
  if (typeof value === 'string' || typeof value === 'number') {
    return true;
  }

  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'node' in value &&
    (value.node === 'token' || value.node === 'id')
  );
}

function isReferenceValue(value: PropValue): value is TokenReference | IDReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'node' in value &&
    (value.node === 'token' || value.node === 'id')
  );
}
