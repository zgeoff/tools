import { createHash } from 'node:crypto';

export function buildTextWithBlobPrefix(stem: string, prefix: string): string {
  for (let count = 0; ; count += 1) {
    const text = `${stem} ${count}\n`;

    const blob = createHash('sha1')
      .update(`blob ${Buffer.byteLength(text)}\0${text}`)
      .digest('hex');

    if (blob.startsWith(prefix)) {
      return text;
    }
  }
}
