import { expect, test } from 'bun:test';
import { buildAuditScript } from './build-audit-script.ts';

test.each([
  [
    'bun audit',
    ['GHSA-bbbb-bbbb-bbbb', 'GHSA-aaaa-aaaa-aaaa'],
    'bun audit --ignore=GHSA-aaaa-aaaa-aaaa --ignore=GHSA-bbbb-bbbb-bbbb',
  ],
  ['bun audit --ignore=GHSA-aaaa-aaaa-aaaa', [], 'bun audit'],
  [
    'bun audit --ignore GHSA-aaaa-aaaa-aaaa --audit-level=high',
    ['GHSA-cccc-cccc-cccc'],
    'bun audit --audit-level=high --ignore=GHSA-cccc-cccc-cccc',
  ],
  ['bun audit', ['1130591', '1130591'], 'bun audit --ignore=1130591'],
])('it rewrites %s with the ignores %j', (script, ignoreIDs, expected) => {
  expect(buildAuditScript(script, ignoreIDs)).toBe(expected);
});
