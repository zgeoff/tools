import { isRecord } from '../../packages/std/src/is-record.ts';
import type { SkillsTreeFile } from './build-skill-files-manifest.ts';

// Returns the blobs of a git tree response from GitHub, or null when the response is not a whole
// tree: GitHub cuts a large recursive tree short and marks it truncated, which would hide new files.
export function parseSkillsTree(value: unknown): SkillsTreeFile[] | null {
  if (!isRecord(value) || value['truncated'] !== false || !Array.isArray(value['tree'])) {
    return null;
  }

  const files: SkillsTreeFile[] = [];

  for (const item of value['tree']) {
    if (
      !isRecord(item) ||
      typeof item['path'] !== 'string' ||
      typeof item['mode'] !== 'string' ||
      typeof item['type'] !== 'string'
    ) {
      return null;
    }

    if (item['type'] === 'blob') {
      files.push({ path: item['path'], mode: item['mode'] });
    }
  }

  return files;
}
