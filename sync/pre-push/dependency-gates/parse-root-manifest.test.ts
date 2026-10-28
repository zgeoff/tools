import { expect, test } from 'bun:test';
import { parseRootManifest } from './parse-root-manifest.ts';

test('it reads the overrides, the workspace catalog and the audit script', () => {
  const text = JSON.stringify({
    workspaces: { packages: ['packages/*'], catalog: { 'left-pad': '1.3.1' } },
    scripts: { audit: 'bun audit --ignore=GHSA-aaaa-bbbb-cccc' },
    overrides: { 'right-pad': '2.0.1' },
  });

  expect(parseRootManifest(text)).toStrictEqual({
    overrides: { 'right-pad': '2.0.1' },
    catalog: { 'left-pad': '1.3.1' },
    auditScript: 'bun audit --ignore=GHSA-aaaa-bbbb-cccc',
  });
});

test('it reads a manifest with no overrides, no catalog and no audit script as empty', () => {
  const text = JSON.stringify({ workspaces: ['packages/*'], scripts: { test: 'bun test' } });

  expect(parseRootManifest(text)).toStrictEqual({ overrides: {}, catalog: {}, auditScript: '' });
});

test('it rejects an override whose value is not a version', () => {
  const text = JSON.stringify({ overrides: { 'left-pad': { 'right-pad': '2.0.1' } } });

  expect(() => parseRootManifest(text)).toThrowWithMessage(
    TypeError,
    'package.json sets the overrides entry for left-pad to a value that is not a version',
  );
});

test('it rejects overrides that are not an object', () => {
  const text = JSON.stringify({ overrides: ['left-pad'] });

  expect(() => parseRootManifest(text)).toThrowWithMessage(
    TypeError,
    'package.json sets overrides to a value that is not an object',
  );
});

test('it rejects a manifest that holds no object', () => {
  expect(() => parseRootManifest('[]')).toThrowWithMessage(
    TypeError,
    'package.json holds no object',
  );
});
