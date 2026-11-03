import { expect, test } from 'bun:test';
import { isAbsolute } from 'node:path';
import { buildRigConfigSource } from './build-rig-config-source.ts';

test('it imports defineRig from rig by absolute path and passes the declaration', () => {
  const source = buildRigConfigSource("{ lanes: { kiln: { limit: '15s' } } }");
  const importedPath = /from "(?<path>[^"]+)"/u.exec(source)?.groups?.['path'] ?? '';

  expect(isAbsolute(importedPath)).toBeTrue();
  expect(importedPath).toEndWith('/packages/rig/src/index.ts');
  expect(source).toEndWith("export default defineRig({ lanes: { kiln: { limit: '15s' } } });\n");
});
