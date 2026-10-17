// Parses the last line of bun's output that starts with a brace; a lifecycle
// script or a version banner can print before the JSON.
export function parseJSONLine(stdout: string): unknown {
  const line = stdout
    .split('\n')
    .toReversed()
    .find((candidate) => candidate.startsWith('{'));

  if (line === undefined) {
    throw new Error(`bun printed no JSON:\n${stdout}`);
  }

  return JSON.parse(line);
}
