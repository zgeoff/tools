// Matches as a bash [[ path == pattern ]] does: `*` matches `/` too, and bash turns the extended
// patterns, such as `@(api|web)`, on inside [[ ]] whatever the extglob option says.
export function isPathMatched(path: string, pattern: string): boolean {
  return isTextMatched(parsePattern(pattern), path);
}

type ExtendedOperator = '@' | '?' | '*' | '+' | '!';

type PatternNode =
  | { readonly kind: 'literal'; readonly character: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'one' }
  | { readonly kind: 'set'; readonly isNegated: boolean; readonly members: string }
  | {
      readonly kind: 'extended';
      readonly operator: ExtendedOperator;
      readonly alternatives: readonly (readonly PatternNode[])[];
    };

function isTextMatched(nodes: readonly PatternNode[], text: string): boolean {
  const known = new Map<number, boolean>();

  const isMatchedFrom = (nodeIndex: number, position: number): boolean => {
    const key = nodeIndex * (text.length + 1) + position;
    const cached = known.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const node = nodes[nodeIndex];

    const isMatched =
      node === undefined
        ? position === text.length
        : collectNodeEnds(node, text, position).some((end) => isMatchedFrom(nodeIndex + 1, end));

    known.set(key, isMatched);

    return isMatched;
  };

  return isMatchedFrom(0, 0);
}

// The positions where a match of the node that starts at the position can end.
function collectNodeEnds(node: PatternNode, text: string, position: number): number[] {
  const rest = Array.from({ length: text.length - position + 1 }, (_, offset) => position + offset);
  const character = text.charAt(position);
  const hasCharacter = position < text.length;

  const ends: Record<PatternNode['kind'], () => number[]> = {
    literal: () =>
      hasCharacter && node.kind === 'literal' && character === node.character ? [position + 1] : [],
    one: () => (hasCharacter ? [position + 1] : []),
    set: () =>
      hasCharacter && node.kind === 'set' && isSetMember(node.members, character) !== node.isNegated
        ? [position + 1]
        : [],
    any: () => rest,
    extended: () =>
      node.kind === 'extended'
        ? rest.filter((end) => isExtendedMatched(node, text.slice(position, end)))
        : [],
  };

  return ends[node.kind]();
}

function isSetMember(members: string, character: string): boolean {
  for (let index = 0; index < members.length; index += 1) {
    const isRange = members.charAt(index + 1) === '-' && index + 2 < members.length;

    if (isRange) {
      if (members.charAt(index) <= character && character <= members.charAt(index + 2)) {
        return true;
      }

      index += 2;
    } else if (members.charAt(index) === character) {
      return true;
    }
  }

  return false;
}

interface ExtendedNode {
  readonly operator: ExtendedOperator;
  readonly alternatives: readonly (readonly PatternNode[])[];
}

function isExtendedMatched(node: ExtendedNode, segment: string): boolean {
  const isAlternative = (text: string) =>
    node.alternatives.some((alternative) => isTextMatched(alternative, text));

  const isRepeated = (text: string): boolean =>
    text !== '' &&
    Array.from({ length: text.length }, (_, index) => index + 1).some(
      (end) =>
        isAlternative(text.slice(0, end)) && (end === text.length || isRepeated(text.slice(end))),
    );

  const operators: Record<ExtendedOperator, () => boolean> = {
    '@': () => isAlternative(segment),
    '?': () => segment === '' || isAlternative(segment),
    '*': () => segment === '' || isRepeated(segment),
    '+': () => isRepeated(segment),
    '!': () => !isAlternative(segment),
  };

  return operators[node.operator]();
}

function parsePattern(pattern: string): PatternNode[] {
  const nodes: PatternNode[] = [];
  let index = 0;

  while (index < pattern.length) {
    const parsed = parseNode(pattern, index);

    nodes.push(parsed.node);

    index = parsed.end;
  }

  return nodes;
}

interface ParsedNode {
  readonly node: PatternNode;
  readonly end: number;
}

function parseNode(pattern: string, index: number): ParsedNode {
  const character = pattern.charAt(index);
  const extended = parseExtended(pattern, index);

  if (extended !== undefined) {
    return extended;
  }

  if (character === '\\' && index + 1 < pattern.length) {
    return { node: { kind: 'literal', character: pattern.charAt(index + 1) }, end: index + 2 };
  }

  if (character === '*') {
    return { node: { kind: 'any' }, end: index + 1 };
  }

  if (character === '?') {
    return { node: { kind: 'one' }, end: index + 1 };
  }

  return parseSet(pattern, index) ?? { node: { kind: 'literal', character }, end: index + 1 };
}

// An operator before `(` opens an extended pattern only when its `)` closes it; otherwise both
// characters keep their plain meaning.
function parseExtended(pattern: string, index: number): ParsedNode | undefined {
  const operator = pattern.charAt(index);

  if (!isExtendedOperator(operator) || pattern.charAt(index + 1) !== '(') {
    return undefined;
  }

  const close = findGroupClose(pattern, index + 1);

  if (close === undefined) {
    return undefined;
  }

  const alternatives = splitAlternatives(pattern.slice(index + 2, close)).map((alternative) =>
    parsePattern(alternative),
  );

  return { node: { kind: 'extended', operator, alternatives }, end: close + 1 };
}

const extendedOperators: ReadonlySet<string> = new Set(['@', '?', '*', '+', '!']);

function isExtendedOperator(value: string): value is ExtendedOperator {
  return extendedOperators.has(value);
}

function findGroupClose(pattern: string, open: number): number | undefined {
  let depth = 0;

  for (let index = open; index < pattern.length; index += 1) {
    const character = pattern.charAt(index);

    if (character === '\\') {
      index += 1;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

// A `|` inside a nested group or after a backslash belongs to that alternative.
function splitAlternatives(body: string): string[] {
  const alternatives: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const character = body.charAt(index);

    if (character === '\\') {
      index += 1;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    } else if (character === '|' && depth === 0) {
      alternatives.push(body.slice(start, index));

      start = index + 1;
    }
  }

  return [...alternatives, body.slice(start)];
}

// A set ends at the first `]` after its first member, so `[]a]` holds `]` and `a`, and a `[` with
// no `]` after it is a literal.
function parseSet(pattern: string, index: number): ParsedNode | undefined {
  if (pattern.charAt(index) !== '[') {
    return undefined;
  }

  const isNegated = pattern.charAt(index + 1) === '!' || pattern.charAt(index + 1) === '^';
  const firstMember = index + (isNegated ? 2 : 1);
  const close = pattern.indexOf(']', firstMember + 1);

  if (close === -1) {
    return undefined;
  }

  return {
    node: { kind: 'set', isNegated, members: pattern.slice(firstMember, close) },
    end: close + 1,
  };
}
