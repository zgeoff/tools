import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPackageVersion } from './read-package-version.ts';

test('it reads the version field from a package manifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-package-version-'));
  const manifest = path.join(dir, 'package.json');

  fs.writeFileSync(manifest, '{"name":"x","version":"1.2.3"}');
  expect(readPackageVersion(manifest)).toBe('1.2.3');
});

test('it throws when the file is not a package manifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-package-version-'));
  const manifest = path.join(dir, 'package.json');

  fs.writeFileSync(manifest, '{"name":"x"}');
  expect(() => readPackageVersion(manifest)).toThrowWithMessage(TypeError, 'Invalid package.json');
});
