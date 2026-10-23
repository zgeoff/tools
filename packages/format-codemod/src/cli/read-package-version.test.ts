import { expect, onTestFinished, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPackageVersion } from './read-package-version.ts';

function setupTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'read-package-version-'));

  onTestFinished(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory };
}

test('it reads the version field from a package manifest', () => {
  const ctx = setupTest();
  const manifest = path.join(ctx.directory, 'package.json');

  fs.writeFileSync(manifest, '{"name":"x","version":"1.2.3"}');

  expect(readPackageVersion(manifest)).toBe('1.2.3');
});

test('it throws when the file is not a package manifest', () => {
  const ctx = setupTest();
  const manifest = path.join(ctx.directory, 'package.json');

  fs.writeFileSync(manifest, '{"name":"x"}');

  expect(() => readPackageVersion(manifest)).toThrowWithMessage(TypeError, 'Invalid package.json');
});
