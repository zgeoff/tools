export interface BodySection {
  // The heading text, or undefined for the lines before the first heading.
  readonly heading: string | undefined;

  // The lines outside code blocks.
  readonly lines: readonly string[];

  // Whether the section holds anything, a code block included.
  readonly isFilled: boolean;
}

export interface CodeBlock {
  readonly section: string;
  readonly lines: readonly string[];
  readonly isClosed: boolean;
}

export interface ParsedBody {
  readonly sections: readonly BodySection[];
  readonly codeBlocks: readonly CodeBlock[];
}

const fenceLine = /^\s{0,3}(?<fence>`{3,}|~{3,})/u;
const headingLine = /^##\s+(?<text>.*?)\s*$/u;

interface OpenBlock {
  readonly marker: string;
  readonly lines: string[];
}

// Reads the body line by line, so a heading or a placeholder inside a code block never counts.
export function parsePrBody(text: string): ParsedBody {
  const sections: { heading: string | undefined; lines: string[]; isFilled: boolean }[] = [
    { heading: undefined, lines: [], isFilled: false },
  ];

  const codeBlocks: CodeBlock[] = [];
  let open: OpenBlock | undefined;

  for (const line of text.split('\n')) {
    const section = sections.at(-1);

    if (section === undefined) {
      continue;
    }

    const fence = fenceLine.exec(line)?.groups?.['fence'];

    if (open !== undefined) {
      if (
        fence !== undefined &&
        fence.startsWith(open.marker.charAt(0)) &&
        fence.length >= open.marker.length &&
        line.trim() === fence
      ) {
        codeBlocks.push({
          section: toSectionName(section.heading),
          lines: open.lines,
          isClosed: true,
        });

        open = undefined;
      } else {
        open.lines.push(line);
      }

      continue;
    }

    if (fence !== undefined) {
      open = { marker: fence, lines: [] };
      section.isFilled = true;
      continue;
    }

    const heading = headingLine.exec(line)?.groups?.['text'];

    if (heading !== undefined) {
      sections.push({ heading, lines: [], isFilled: false });
      continue;
    }

    section.lines.push(line);

    if (line.trim() !== '') {
      section.isFilled = true;
    }
  }

  const lastSection = sections.at(-1);

  if (open !== undefined && lastSection !== undefined) {
    codeBlocks.push({
      section: toSectionName(lastSection.heading),
      lines: open.lines,
      isClosed: false,
    });
  }

  return { sections, codeBlocks };
}

export function toSectionName(heading: string | undefined): string {
  return heading ?? 'The start of the body';
}
