const quotes = new Set(['"', "'", '`']);

// drops the comments of a source text and keeps every string and template literal whole, so a
// `//` or `/*` inside a string never cuts the code after it
export default function buildCodeWithoutComments(text) {
  let code = '';
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (quotes.has(char)) {
      const end = findLiteralEnd(text, index);

      code += text.slice(index, end);
      index = end;
    } else if (char === '/' && next === '/') {
      index = findLineEnd(text, index);
    } else if (char === '/' && next === '*') {
      code += ' ';
      index = findBlockEnd(text, index);
    } else {
      code += char;
      index += 1;
    }
  }

  return code;
}

function findLiteralEnd(text, start) {
  const quote = text[start];
  let index = start + 1;

  while (index < text.length && text[index] !== quote) {
    index += text[index] === '\\' ? 2 : 1;
  }

  return Math.min(index + 1, text.length);
}

function findLineEnd(text, start) {
  const end = text.indexOf('\n', start);

  return end === -1 ? text.length : end;
}

function findBlockEnd(text, start) {
  const end = text.indexOf('*/', start + 2);

  return end === -1 ? text.length : end + 2;
}
