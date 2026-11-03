export function isLineMatch(line: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return line.includes(pattern);
  }

  // A global or sticky pattern moves lastIndex on each test, so a later line would be skipped.
  pattern.lastIndex = 0;

  return pattern.test(line);
}
