interface BunfigWithoutExpiredExcludes {
  readonly bunfig: string;

  // The packages whose exclude the step dropped.
  readonly removed: readonly string[];
}

const excludeComment =
  /^# (?<name>\S+) \S+ \(published [^)]*\) ages past the gate ~(?<date>\d{4}-\d{2}-\d{2}) — remove then \(audit-fix\)\n/gmu;

// Drops each exclude the audit-fix step added, with its dated comment, once the
// release has aged past the gate. An entry with no audit-fix comment stays.
export function buildBunfigWithoutExpiredExcludes(
  bunfig: string,
  today: string,
): BunfigWithoutExpiredExcludes {
  const removed: string[] = [];

  const withoutComments = bunfig.replaceAll(excludeComment, (line, ...rest: unknown[]) => {
    const groups = rest.at(-1);
    const name = isGroups(groups) ? groups['name'] : undefined;
    const date = isGroups(groups) ? groups['date'] : undefined;

    if (name === undefined || date === undefined || date > today) {
      return line;
    }

    removed.push(name);

    return '';
  });

  if (removed.length === 0) {
    return { bunfig, removed };
  }

  return { bunfig: removeExcludeNames(withoutComments, removed), removed };
}

function isGroups(value: unknown): value is Record<string, string | undefined> {
  return typeof value === 'object' && value !== null;
}

function removeExcludeNames(bunfig: string, names: readonly string[]): string {
  const start = /^minimumReleaseAgeExcludes\s*=\s*\[/mu.exec(bunfig);

  if (start === null) {
    return bunfig;
  }

  const end = bunfig.indexOf(']', start.index);
  let list = bunfig.slice(start.index, end);

  for (const name of names) {
    const quoted = `"${name}"`;

    list = list.includes('\n')
      ? list
          .split('\n')
          .filter((line) => !line.trim().startsWith(quoted))
          .join('\n')
      : list.replace(new RegExp(`\\s*${RegExp.escape(quoted)}\\s*,?`, 'u'), '');
  }

  // A one-line list that lost its last entry keeps no dangling comma.
  if (!list.includes('\n')) {
    list = list.replace(/,\s*$/u, '');
  }

  return `${bunfig.slice(0, start.index)}${list}${bunfig.slice(end)}`;
}
