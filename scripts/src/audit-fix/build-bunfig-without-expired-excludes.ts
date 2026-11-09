interface BunfigWithoutExpiredExcludes {
  readonly bunfig: string;

  readonly removed: readonly string[];
}

const excludeComment =
  /^# (?<name>\S+) \S+ \(published [^)]*\) ages past the gate ~(?<date>\d{4}-\d{2}-\d{2}) — remove then \(audit-fix\)\n/gmu;

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

  return { bunfig: buildBunfigWithoutNames(withoutComments, removed), removed };
}

function isGroups(value: unknown): value is Record<string, string | undefined> {
  return typeof value === 'object' && value !== null;
}

function buildBunfigWithoutNames(bunfig: string, names: readonly string[]): string {
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
          .map((line) => line.replace(new RegExp(`${RegExp.escape(quoted)}\\s*,?[ \\t]*`, 'u'), ''))
          .filter(
            (line, index, lines) => index === 0 || index === lines.length - 1 || line.trim() !== '',
          )
          .join('\n')
      : list.replace(new RegExp(`\\s*${RegExp.escape(quoted)}\\s*,?`, 'u'), '');
  }

  if (!list.includes('\n')) {
    list = list.replace(/,\s*$/u, '');
  }

  return `${bunfig.slice(0, start.index)}${list}${bunfig.slice(end)}`;
}
