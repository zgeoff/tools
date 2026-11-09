// Renders the sync manifest as oxfmt formats it, so a step that rewrites the manifest leaves
// a diff of only the lines it changed: each object on its own lines, and an array of plain values
// on one line when that line fits the print width.
export function renderManifestText(manifest: unknown): string {
  return `${renderValue(manifest, '', '', '')}\n`;
}

// The prefix and suffix are the text around the value on its line, which counts toward the width.
function renderValue(value: unknown, indent: string, prefix: string, suffix: string): string {
  if (Array.isArray(value)) {
    return renderArray(value, indent, prefix, suffix);
  }

  if (typeof value === 'object' && value !== null) {
    return renderObject(Object.entries(value), indent);
  }

  return JSON.stringify(value);
}

// oxfmt's print width in this repo's .oxfmtrc.json.
const printWidth = 100;

function renderArray(
  items: readonly unknown[],
  indent: string,
  prefix: string,
  suffix: string,
): string {
  if (items.length === 0) {
    return '[]';
  }

  const isFlat = items.every((item) => typeof item !== 'object' || item === null);
  const inline = `[${items.map((item) => JSON.stringify(item)).join(', ')}]`;

  if (isFlat && indent.length + prefix.length + inline.length + suffix.length <= printWidth) {
    return inline;
  }

  const inner = `${indent}  `;

  const lines = items.map((item, index) => {
    const comma = index < items.length - 1 ? ',' : '';

    return `${inner}${renderValue(item, inner, '', comma)}`;
  });

  return `[\n${lines.join(',\n')}\n${indent}]`;
}

function renderObject(entries: readonly (readonly [string, unknown])[], indent: string): string {
  if (entries.length === 0) {
    return '{}';
  }

  const inner = `${indent}  `;

  const lines = entries.map(([key, value], index) => {
    const prefix = `${JSON.stringify(key)}: `;
    const suffix = index < entries.length - 1 ? ',' : '';

    return `${inner}${prefix}${renderValue(value, inner, prefix, suffix)}`;
  });

  return `{\n${lines.join(',\n')}\n${indent}}`;
}
