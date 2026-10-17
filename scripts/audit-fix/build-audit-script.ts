// Rewrites a package.json `audit` script so its --ignore flags are exactly the
// given advisory IDs, sorted, after the script's other arguments.
export function buildAuditScript(script: string, ignoreIDs: readonly string[]): string {
  const tokens = script.trim().split(/\s+/u);
  const kept: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--ignore') {
      // The next token is the flag's value.
      index += 1;
    } else if (token !== undefined && !token.startsWith('--ignore=')) {
      kept.push(token);
    }
  }

  const flags = [...new Set(ignoreIDs)].toSorted().map((id) => `--ignore=${id}`);

  return [...kept, ...flags].join(' ');
}
