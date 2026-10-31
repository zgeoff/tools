import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { URLOutcome } from '../scripts/ci/download-step-scripts.ts';

// Stands in for raw.githubusercontent.com at a tools commit: it serves each URL under the tools URL
// from the same path in a local checkout, as the download step reads a step script and its imports.
export function makeStubToolsURLReader(
  toolsURL: string,
  checkout: string,
): (url: string) => Promise<URLOutcome> {
  return async (url) => {
    const text = await readFile(join(checkout, url.slice(toolsURL.length + 1)), 'utf8');

    return { kind: 'read', text };
  };
}
