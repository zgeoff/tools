import { z } from 'zod';
import type { SkillsTreeFile } from './build-skill-files-manifest.ts';

const treeItemSchema = z.object({ path: z.string(), mode: z.string(), type: z.string() });

// GitHub cuts a large recursive tree short and marks it truncated, which would hide new files, so
// only a whole tree parses.
const skillsTreeSchema = z.object({ truncated: z.literal(false), tree: z.array(treeItemSchema) });

export function parseSkillsTree(value: unknown): SkillsTreeFile[] | null {
  const parsed = skillsTreeSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return parsed.data.tree
    .filter((item) => item.type === 'blob')
    .map((item) => ({ path: item.path, mode: item.mode }));
}
