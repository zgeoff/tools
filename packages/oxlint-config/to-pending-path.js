import { posix } from 'node:path';

export default function toPendingPath(entry) {
  return posix.normalize(entry.replaceAll('\\', '/')).replace(/(?<=.)\/+$/u, '');
}
