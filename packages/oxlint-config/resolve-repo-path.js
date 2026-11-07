import { relative } from 'node:path';
import resolveRepoRoot from './resolve-repo-root.js';

export default function resolveRepoPath(filename, cwd) {
  return relative(resolveRepoRoot(filename) ?? cwd, filename);
}
