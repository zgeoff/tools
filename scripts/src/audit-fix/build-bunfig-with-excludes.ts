export interface ReleaseAgeExclude {
  readonly name: string;
  readonly version: string;

  readonly publishedOn: string;

  readonly agesPastGateOn: string;
  readonly advisories: readonly string[];
}

const excludesLine = /^minimumReleaseAgeExcludes\s*=\s*\[/mu;
const gateLine = /^minimumReleaseAge\s*=.*$/mu;

export function buildBunfigWithExcludes(
  bunfig: string,
  excludes: readonly ReleaseAgeExclude[],
): string {
  const existing = excludesLine.exec(bunfig);
  const current = existing === null ? [] : parseExcludeNames(bunfig, existing.index);
  const added = excludes.filter((exclude) => !current.includes(exclude.name));

  if (added.length === 0) {
    return bunfig;
  }

  const comments = added.map((exclude) => `${renderExcludeComment(exclude)}\n`).join('');
  const names = added.map((exclude) => exclude.name);

  if (existing !== null) {
    const end = bunfig.indexOf(']', existing.index);
    const list = buildListWithNames(bunfig.slice(existing.index, end), names);

    return `${bunfig.slice(0, existing.index)}${comments}${list}${bunfig.slice(end)}`;
  }

  const gate = gateLine.exec(bunfig);

  if (gate === null) {
    throw new Error('bunfig.toml sets no minimumReleaseAge, so no release needs an exclude');
  }

  const end = gate.index + gate[0].length;
  const list = `minimumReleaseAgeExcludes = [\n${names.map((name) => `  "${name}",\n`).join('')}]`;

  return `${bunfig.slice(0, end)}\n\n${comments}${list}${bunfig.slice(end)}`;
}

function parseExcludeNames(bunfig: string, start: number): string[] {
  const end = bunfig.indexOf(']', start);

  if (end === -1) {
    throw new Error('bunfig.toml has a minimumReleaseAgeExcludes list with no closing bracket');
  }

  const body = bunfig.slice(bunfig.indexOf('[', start) + 1, end);

  return [...body.matchAll(/"(?<name>[^"]+)"/gu)].map((match) => match.groups?.['name'] ?? '');
}

function renderExcludeComment(exclude: ReleaseAgeExclude): string {
  return `# ${exclude.name} ${exclude.version} (published ${exclude.publishedOn}, patches ${exclude.advisories.join(' + ')}) ages past the gate ~${exclude.agesPastGateOn} — remove then (audit-fix)`;
}

function buildListWithNames(listUpToBracket: string, names: readonly string[]): string {
  // A comma after a `#` on the last entry's line would sit inside the TOML comment.
  const lastQuote = listUpToBracket.lastIndexOf('"');
  const isEmpty = lastQuote === -1;
  const rest = listUpToBracket.slice(lastQuote + 1);

  const separated =
    isEmpty || /^\s*,/u.test(rest)
      ? listUpToBracket
      : `${listUpToBracket.slice(0, lastQuote + 1)},${rest}`;

  const body = separated.trimEnd();

  if (listUpToBracket.includes('\n')) {
    return `${body}\n${names.map((name) => `  "${name}",\n`).join('')}`;
  }

  const quoted = names.map((name) => `"${name}"`).join(', ');

  return isEmpty ? `${body}${quoted}` : `${body} ${quoted}`;
}
