import fs from 'node:fs';
import { transform } from '../transform.ts';
import { handleDiff } from './handle-diff.ts';
import type { CLIMode, FileReport } from './types.ts';

export function checkFile(file: string, mode: CLIMode): FileReport {
  const src = fs.readFileSync(file, 'utf8');
  // byteLength, not src.length: bench throughput is measured in bytes and the
  // two diverge on any non-ASCII source.
  const bytes = Buffer.byteLength(src);
  const result = transform(src, { filename: file });

  if (result.parseError !== null) {
    return {
      outcome: 'failed',
      bytes,
      parsed: false,
      message: `PARSE-ERR ${file}  ${result.parseError}`,
      stdout: null,
    };
  }

  if (result.edits === 0 || result.output === src) {
    return { outcome: 'ok', bytes, parsed: true, message: null, stdout: null };
  }

  return { outcome: 'changed', bytes, parsed: true, ...handleDiff({ file, src, result }, mode) };
}
