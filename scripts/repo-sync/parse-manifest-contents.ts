import { isRecord } from '../../packages/std/src/is-record.ts';

export interface ManifestContents {
  // The blob of the file, which the contents API needs to replace it.
  readonly sha: string;

  readonly text: string;
}

// Returns the file of a contents API response from GitHub, or null when the response holds no
// base64 content, as it does for a file over 1 MB.
export function parseManifestContents(value: unknown): ManifestContents | null {
  if (
    !isRecord(value) ||
    typeof value['sha'] !== 'string' ||
    typeof value['content'] !== 'string' ||
    value['encoding'] !== 'base64'
  ) {
    return null;
  }

  return { sha: value['sha'], text: Buffer.from(value['content'], 'base64').toString() };
}
