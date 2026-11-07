import { relative, sep } from 'node:path';
import pickFolderKind from './pick-folder-kind.js';

export default function findFeatureFolder(source, target) {
  const segments = relative(source, target).split(sep);

  if (segments.length < 2 || segments[0] === '..' || pickFolderKind(segments[0]) !== 'feature') {
    return null;
  }

  return segments[0];
}
