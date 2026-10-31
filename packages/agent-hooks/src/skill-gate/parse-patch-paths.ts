const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (?<path>.+)$/u;

// An apply_patch patch names each path it changes in a header line. A line of file content always
// opens with +, - or a space, so a line that opens with *** is a header.
export function parsePatchPaths(patch: string): readonly string[] {
  const paths = patch
    .split('\n')
    .flatMap((line) => PATCH_HEADER.exec(line.replace(/\r$/u, ''))?.groups?.['path']?.trim() ?? []);

  return [...new Set(paths)];
}
