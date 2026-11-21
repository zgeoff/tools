const chexLine = /^- \[[ xX]\] chex(?=[ \t]*\r?$)/gmu;
const htmlComment = /<!--[\s\S]*?-->/gu;

// Changes only the first chex checkbox line outside an HTML comment, and returns the rest of the
// body byte for byte. A body with no such line comes back unchanged.
export function tickPrBodyChex(body: string, passed: boolean): string {
  const comments = [...body.matchAll(htmlComment)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));

  const line = [...body.matchAll(chexLine)].find(
    (match) =>
      !comments.some((comment) => match.index >= comment.start && match.index < comment.end),
  );

  if (line === undefined) {
    return body;
  }

  return `${body.slice(0, line.index)}- [${passed ? 'x' : ' '}] chex${body.slice(line.index + line[0].length)}`;
}
