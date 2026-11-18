import { z } from 'zod';

// rig matches each glob against bare paths relative to the repo root, so an absolute glob, one
// that climbs out of the repo, or one with a `./` segment would never match.
export const repoGlobSchema = z
  .string()
  .refine((pattern) => pattern !== '' && !pattern.startsWith('/') && !hasDotSegment(pattern));

function hasDotSegment(path: string): boolean {
  return path.split('/').some((segment) => segment === '.' || segment === '..');
}
