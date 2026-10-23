import { expect, onTestFinished, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tryCheckFile } from './try-check-file.ts';

function setupTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'process-file-'));

  onTestFinished(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory };
}

test('it skips declaration files without reading them', () => {
  const report = tryCheckFile('does-not-even-exist.d.ts', 'check');

  expect(report).toMatchObject({ outcome: 'skipped', message: null });
});

test('it reports failed with an ERROR message when the file cannot be read', () => {
  const missing = path.join(os.tmpdir(), 'process-file-none', 'missing.ts');
  const report = tryCheckFile(missing, 'check');

  expect(report).toMatchObject({ outcome: 'failed', message: expect.toStartWith('ERROR') });
});

test('it passes readable files through to the transform', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'unpadded.ts');

  fs.writeFileSync(file, 'const a = 1;\nuse(a);\n');

  expect(tryCheckFile(file, 'check')).toContainEntry(['outcome', 'changed']);
});
