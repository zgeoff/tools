export interface AddedLine {
  // The short hash of the commit that adds the line.
  readonly hash: string;

  // Relative to the repo root.
  readonly path: string;

  // The line's number in the file as the commit leaves it.
  readonly line: number;

  readonly text: string;
}

// Turns `git log -p -U0 --format=%x00%h` output into the lines each commit adds. Each commit starts
// with a NUL and its hash, which no line of a patch can start with.
export function parseAddedLines(patch: string): AddedLine[] {
  const hunkHeader = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/u;
  const added: AddedLine[] = [];
  let hash = '';
  let path: string | null = null;
  let line = 0;

  // A file's header runs from its `diff --git` line to its first hunk. Inside a hunk, an added line
  // that starts with `++` reads like a `+++` header line, so the state tells the two apart.
  let inHeader = false;

  for (const text of patch.split('\n')) {
    if (text.startsWith('\0')) {
      hash = text.slice(1);
      path = null;
      inHeader = false;
    } else if (text.startsWith('diff --git ')) {
      path = null;
      inHeader = true;
    } else if (inHeader && text.startsWith('+++ ')) {
      path = parseNewPath(text.slice('+++ '.length));
    } else if (hunkHeader.test(text)) {
      line = Number(hunkHeader.exec(text)?.groups?.['start']);
      inHeader = false;
    } else if (!inHeader && path !== null && text.startsWith('+')) {
      added.push({ hash, path, line, text: text.slice(1) });

      line += 1;
    }
  }

  return added;
}

// `b/path`, or `/dev/null` for a file the commit deletes. git ends the name with a tab when it holds
// a space, and quotes it when it holds a character it escapes.
function parseNewPath(name: string): string | null {
  const bare = name.replace(/\t$/u, '');

  if (bare === '/dev/null') {
    return null;
  }

  const unquoted = bare.startsWith('"') && bare.endsWith('"') ? bare.slice(1, -1) : bare;

  return unquoted.replace(/^b\//u, '');
}
