export function isTextEntry(entry: [string, unknown]): entry is [string, string] {
  return typeof entry[1] === 'string';
}
