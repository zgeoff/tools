import fs from 'node:fs';
import { transform } from '../transform.ts';
import type { CliMode, FileReport } from '../types.ts';
import { handleDiff } from './handle-diff.ts';

export function checkFile(file: string, mode: CliMode): FileReport {
  const src = fs.readFileSync(file, 'utf8');
  // byteLength, not src.length: bench throughput is measured in bytes and the
  // two diverge on any non-ASCII source.
  const bytes = Buffer.byteLength(src);
  const result = transform(src, { filename: file });

  if (result.parseError !== null) {
    console.error(`PARSE-ERR ${file}  ${result.parseError}`);

    return { outcome: 'failed', bytes, parsed: false };
  }

  if (result.edits === 0 || result.output === src) {
    return { outcome: 'ok', bytes, parsed: true };
  }
  handleDiff({ file, src, result }, mode);

  return { outcome: 'changed', bytes, parsed: true };
}
