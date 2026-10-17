import { expect, test } from 'bun:test';
import { parseAuditScript } from './parse-audit-script.ts';
import type { Severity } from './types.ts';

test.each<[string, string[], Severity | null]>([
  ['bun audit', [], null],
  ['bun audit --ignore=GHSA-aaaa-bbbb-cccc', ['GHSA-aaaa-bbbb-cccc'], null],
  [
    'bun audit --ignore GHSA-aaaa-bbbb-cccc --ignore 1130591',
    ['GHSA-aaaa-bbbb-cccc', '1130591'],
    null,
  ],
  ['bun audit --audit-level=high --ignore=GHSA-aaaa-bbbb-cccc', ['GHSA-aaaa-bbbb-cccc'], 'high'],
  ['bun audit --audit-level moderate', [], 'moderate'],
])('it reads the flags of %s', (script, ignoreIDs, auditLevel) => {
  expect(parseAuditScript(script)).toStrictEqual({ ignoreIDs, auditLevel });
});

test('it rejects an unknown audit level', () => {
  expect(() => parseAuditScript('bun audit --audit-level=severe')).toThrow(
    'the audit script sets an unknown --audit-level: severe',
  );
});

test('it rejects a script that chains another command', () => {
  expect(() => parseAuditScript('bun audit && echo done')).toThrow(
    'the audit script must be one bun audit command, not a chain: bun audit && echo done',
  );
});
