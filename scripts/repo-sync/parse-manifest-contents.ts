import { z } from 'zod';

export interface ManifestContents {
  // The blob of the file, which the contents API needs to replace it.
  readonly sha: string;

  readonly text: string;
}

// GitHub gives no base64 content for a file over 1 MB, so such a response does not parse.
const manifestContentsSchema = z.object({
  sha: z.string(),
  content: z.string(),
  encoding: z.literal('base64'),
});

export function parseManifestContents(value: unknown): ManifestContents | null {
  const parsed = manifestContentsSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return { sha: parsed.data.sha, text: Buffer.from(parsed.data.content, 'base64').toString() };
}
