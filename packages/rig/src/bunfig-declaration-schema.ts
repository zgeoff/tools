import { z } from 'zod';
import { repoGlobSchema } from './repo-glob-schema.ts';

// rig runs the bunfig's tests from the repo root, and compares a changed file's bare path with the
// bunfig's, so the path follows the same rules as a glob.
export const bunfigDeclarationSchema = z
  .object({
    path: repoGlobSchema.refine((path) => path.endsWith('.toml')),
    files: z.array(repoGlobSchema).min(1),
  })
  .readonly();
