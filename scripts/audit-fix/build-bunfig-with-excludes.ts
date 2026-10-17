export interface ReleaseAgeExclude {
  readonly name: string;
  readonly version: string;

  // ISO date of the release.
  readonly publishedOn: string;

  // ISO date on which the release ages past the gate.
  readonly agesPastGateOn: string;
  readonly advisories: readonly string[];
}

const excludesLine = /^minimumReleaseAgeExcludes\s*=\s*\[/mu;
const gateLine = /^minimumReleaseAge\s*=.*$/mu;

// Adds each package to minimumReleaseAgeExcludes with a dated comment that says
// when to remove it, so `bun install` accepts a fix younger than the gate.
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

// Adds names before the list's closing bracket, so the entries and comments
// already in it stay as they are. A list on one line stays on one line.
function buildListWithNames(listUpToBracket: string, names: readonly string[]): string {
  // The comma goes straight after the last entry, before any comment on its line.
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
