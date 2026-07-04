import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processFile } from '../src/cli/process-file.ts';

test('it skips declaration files without reading them', () => {
  const report = processFile('does-not-even-exist.d.ts', 'check');

  expect(report).toMatchObject({ outcome: 'skipped', message: null });
});

test('it reports failed with an ERROR message when the file cannot be read', () => {
  const missing = path.join(os.tmpdir(), 'process-file-none', 'missing.ts');
  const report = processFile(missing, 'check');

  expect(report).toMatchObject({ outcome: 'failed', message: expect.toStartWith('ERROR') });
});

test('it passes readable files through to the transform', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-file-'));
  const file = path.join(dir, 'unpadded.ts');

  fs.writeFileSync(file, 'const a = 1;\nuse(a);\n');

  expect(processFile(file, 'check')).toContainEntry(['outcome', 'changed']);
});
