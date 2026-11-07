import { isAbsolute, relative, sep } from 'node:path';
import pickFolderKind from './pick-folder-kind.js';

export default function findFeatureFolder(source, target) {
  const path = relative(source, target);
  const segments = path.split(sep);

  if (
    isAbsolute(path) ||
    segments.length < 2 ||
    segments[0] === '..' ||
    pickFolderKind(segments[0]) !== 'feature'
  ) {
    return null;
  }

  return segments[0];
}
