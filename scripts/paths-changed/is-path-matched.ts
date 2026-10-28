// Matches as a bash [[ path == pattern ]] does: `*` matches `/` too, and bash turns the extended
// patterns, such as `@(api|web)`, on inside [[ ]] whatever the extglob option says.
export function isPathMatched(path: string, pattern: string): boolean {
  return isTextMatched(parsePattern(pattern), path);
}

type ExtendedOperator = '@' | '?' | '*' | '+' | '!';

type SetMember =
  | { readonly kind: 'character'; readonly character: string }
  | { readonly kind: 'range'; readonly first: string; readonly last: string }
  | { readonly kind: 'class'; readonly name: string };

type PatternNode =
  | { readonly kind: 'literal'; readonly character: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'one' }
  | { readonly kind: 'set'; readonly isNegated: boolean; readonly members: readonly SetMember[] }
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

// An unknown class name, as in `[[:kettle:]]`, matches no character, as bash's does.
const characterClasses: ReadonlyMap<string, RegExp> = new Map(
  Object.entries({
    alnum: /^[\p{L}\p{Nd}]$/u,
    alpha: /^\p{L}$/u,
    blank: /^[ \t]$/u,
    cntrl: /^\p{Cc}$/u,
    digit: /^[0-9]$/u,
    graph: /^[^\p{Cc}\p{Z}]$/u,
    lower: /^\p{Ll}$/u,
    print: /^[^\p{Cc}]$/u,
    punct: /^[!-/:-@[-`{-~]$/u,
    space: /^\s$/u,
    upper: /^\p{Lu}$/u,
    word: /^[\p{L}\p{Nd}_]$/u,
    xdigit: /^[0-9A-Fa-f]$/u,
  }),
);

function isSetMember(members: readonly SetMember[], character: string): boolean {
  const isMember: Record<SetMember['kind'], (member: SetMember) => boolean> = {
    character: (member) => member.kind === 'character' && member.character === character,
    range: (member) =>
      member.kind === 'range' && member.first <= character && character <= member.last,
    class: (member) =>
      member.kind === 'class' && (characterClasses.get(member.name)?.test(character) ?? false),
  };

  return members.some((member) => isMember[member.kind](member));
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
// no `]` after it is a literal. A `]` inside a class such as `[:digit:]` does not end the set.
function parseSet(pattern: string, index: number): ParsedNode | undefined {
  if (pattern.charAt(index) !== '[') {
    return undefined;
  }

  const isNegated = pattern.charAt(index + 1) === '!' || pattern.charAt(index + 1) === '^';
  const members: SetMember[] = [];
  let position = index + (isNegated ? 2 : 1);

  while (position < pattern.length) {
    if (pattern.charAt(position) === ']' && members.length > 0) {
      return { node: { kind: 'set', isNegated, members }, end: position + 1 };
    }

    const parsed = parseSetMember(pattern, position);

    members.push(parsed.member);

    position = parsed.end;
  }

  return undefined;
}

interface ParsedSetMember {
  readonly member: SetMember;
  readonly end: number;
}

function parseSetMember(pattern: string, position: number): ParsedSetMember {
  const classMatch = /^\[:(?<name>[a-z]*):\]/u.exec(pattern.slice(position));

  if (classMatch !== null) {
    return {
      member: { kind: 'class', name: classMatch.groups?.['name'] ?? '' },
      end: position + classMatch[0].length,
    };
  }

  const first = parseSetCharacter(pattern, position);

  const isRange =
    pattern.charAt(first.end) === '-' &&
    first.end + 1 < pattern.length &&
    pattern.charAt(first.end + 1) !== ']';

  if (isRange) {
    const last = parseSetCharacter(pattern, first.end + 1);

    return {
      member: { kind: 'range', first: first.character, last: last.character },
      end: last.end,
    };
  }

  return { member: { kind: 'character', character: first.character }, end: first.end };
}

interface ParsedSetCharacter {
  readonly character: string;
  readonly end: number;
}

function parseSetCharacter(pattern: string, position: number): ParsedSetCharacter {
  const isEscape = pattern.charAt(position) === '\\' && position + 1 < pattern.length;

  return isEscape
    ? { character: pattern.charAt(position + 1), end: position + 2 }
    : { character: pattern.charAt(position), end: position + 1 };
}
