import { sep } from 'node:path';

// takes the path below the repo root, so a checkout inside a folder named `test-utils` does not
// count every file as test code
export default function isInTestUtils(repoPath) {
  return repoPath.split(sep).includes('test-utils');
}
