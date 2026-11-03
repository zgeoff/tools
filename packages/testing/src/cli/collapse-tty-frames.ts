// Matches a CSI sequence at the sticky position: cursor moves, colours and erases.
// oxlint-disable-next-line no-control-regex -- a CSI sequence starts with the ESC control character
const csiPattern = /\u001B\[[0-9;?]*[A-Za-z~]/uy;

// Turns the bytes a program wrote to a terminal into the text a person sees: a carriage return
// restarts the line, a backspace removes a character, an erase-line sequence clears the line, and
// every other escape sequence goes.
export function collapseTTYFrames(raw: string): string {
  let committed = '';
  let line = '';

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (character === '\r') {
      // The \n of a CRLF commits the line, so the \r keeps it.
      if (raw[index + 1] !== '\n') {
        line = '';
      }
    } else if (character === '\n') {
      committed += `${line}\n`;
      line = '';
    } else if (character === '\b') {
      line = line.slice(0, -1);
    } else if (character === '\u001B') {
      csiPattern.lastIndex = index;

      const sequence = csiPattern.exec(raw)?.[0];

      if (sequence === undefined) {
        line += character;
      } else {
        if (sequence.endsWith('K')) {
          line = '';
        }

        index += sequence.length - 1;
      }
    } else {
      line += character;
    }
  }

  return Bun.stripANSI(committed + line);
}
