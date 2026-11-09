import { relative, sep } from 'node:path';

export default function toRootPath(root, path) {
  return relative(root, path).split(sep).join('/') || '.';
}
