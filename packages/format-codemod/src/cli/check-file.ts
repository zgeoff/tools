import fs from 'node:fs';
import { transform } from '../transform.ts';
import type { CliMode, FileReport } from '../types.ts';
import { handleDiff } from './handle-diff.ts';

export function checkFile(file: string, mode: CliMode): FileReport {
  const src = fs.readFileSync(file, 'utf8');
  const result = transform(src);

  if (result.parseError !== null) {
    console.error(`PARSE-ERR ${file}  ${result.parseError}`);

    return { outcome: 'failed', bytes: src.length, parsed: false };
  }

  if (result.edits === 0 || result.output === src) {
    return { outcome: 'ok', bytes: src.length, parsed: true };
  }
  handleDiff({ file, src, result }, mode);

  return { outcome: 'changed', bytes: src.length, parsed: true };
}
