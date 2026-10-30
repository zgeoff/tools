// The owner starts at the line start or after a character that no owner name holds, so
// other-zgeoff/tools never matches. A ref ends at whitespace, a quote, a comment or a YAML flow
// delimiter.
const callPattern =
  /(?<![A-Za-z0-9._/-])(?<path>zgeoff\/tools\/\.github\/workflows\/[^\]@\s"'{},]+)@[^\]{},\s"'#]+/u;

// A YAML comment runs to the line end, so a call inside a flow mapping or sequence takes no
// `# main` comment: it would swallow the closing bracket.
const lineEndPattern = /^(?<quote>["']?)\s*(?:#.*)?$/u;

export function buildToolsPin(text: string, commit: string): string {
  return text
    .split('\n')
    .map((line) => {
      const call = callPattern.exec(line);

      if (call === null) {
        return line;
      }

      const path = call.groups?.['path'] ?? '';
      const pinned = `${line.slice(0, call.index)}${path}@${commit}`;
      const rest = line.slice(call.index + call[0].length);
      const lineEnd = lineEndPattern.exec(rest);

      return lineEnd === null
        ? `${pinned}${rest}`
        : `${pinned}${lineEnd.groups?.['quote'] ?? ''} # main`;
    })
    .join('\n');
}
