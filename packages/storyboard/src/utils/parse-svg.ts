export interface SVGElementInfo {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly (SVGElementInfo | string)[];
}

interface OpenElement {
  readonly tag: string;
  readonly attributes: Record<string, string>;
  readonly children: (SVGElementInfo | string)[];
}

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?<closing>\/?)(?<tag>[A-Za-z][\w:.-]*)(?<attributes>(?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(?<selfClosing>\/?)>|[^<]+/uy;

// Reads the one root element of an SVG file. It reads the files that the build writes, and files
// as plain as atc's hero: elements, attributes, text and comments, with no doctype and no CDATA.
export function parseSVG(source: string): SVGElementInfo {
  const stack: OpenElement[] = [];
  let root: SVGElementInfo | undefined;
  let offset = 0;

  while (offset < source.length) {
    TOKEN.lastIndex = offset;

    const found = TOKEN.exec(source);

    if (found === null) {
      throw new Error(`the SVG is not well formed near offset ${offset}`);
    }

    offset = TOKEN.lastIndex;

    const groups = found.groups;
    const parent = stack.at(-1);

    if (groups?.['tag'] === undefined) {
      if (!found[0].startsWith('<') && parent !== undefined) {
        parent.children.push(decodeEntities(found[0]));
      }
    } else if (groups['closing'] === '/') {
      const finished = stack.pop();

      if (finished?.tag !== groups['tag']) {
        throw new Error(
          `the SVG closes </${groups['tag']}> where it holds no open <${groups['tag']}>`,
        );
      }

      root = attachElement(finished, stack.at(-1)) ?? root;
    } else {
      const opened: OpenElement = {
        tag: groups['tag'],
        attributes: parseAttributes(groups['attributes'] ?? ''),
        children: [],
      };

      if (groups['selfClosing'] === '/') {
        root = attachElement(opened, parent) ?? root;
      } else {
        stack.push(opened);
      }
    }
  }

  if (root === undefined || stack.length > 0) {
    throw new Error('the SVG holds no complete root element');
  }

  return root;
}

function decodeEntities(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

export function collectSVGElements(root: SVGElementInfo): SVGElementInfo[] {
  return [
    root,
    ...root.children.flatMap((child) =>
      typeof child === 'string' ? [] : collectSVGElements(child),
    ),
  ];
}

// Adds a finished element to its parent, or returns it when it has none, which makes it the root.
function attachElement(
  finished: OpenElement,
  parent: OpenElement | undefined,
): SVGElementInfo | undefined {
  const info: SVGElementInfo = {
    tag: finished.tag,
    attributes: finished.attributes,
    children: finished.children,
  };

  if (parent === undefined) {
    return info;
  }

  parent.children.push(info);

  return undefined;
}

const ATTRIBUTE = /(?<name>[\w:.-]+)(?:\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'))?/gu;

function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const found of text.matchAll(ATTRIBUTE)) {
    const name = found.groups?.['name'];

    if (name !== undefined) {
      attributes[name] = decodeEntities(found.groups?.['double'] ?? found.groups?.['single'] ?? '');
    }
  }

  return attributes;
}
