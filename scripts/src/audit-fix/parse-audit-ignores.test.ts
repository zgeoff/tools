import { expect, test } from 'bun:test';
import { parseAuditIgnores } from './parse-audit-ignores.ts';

test('it reads each ignore', () => {
  const ignore = { package: 'tinypool', reason: 'Waiting on oxfmt.', expires: '2026-11-16' };

  expect(parseAuditIgnores({ 'GHSA-85c8-ppgw-ccpr': ignore })).toStrictEqual({
    'GHSA-85c8-ppgw-ccpr': ignore,
  });
});

test('it rejects an ignore with no ISO expiry date', () => {
  expect(() =>
    parseAuditIgnores({
      'GHSA-85c8-ppgw-ccpr': { package: 'tinypool', reason: 'Waiting.', expires: 'next month' },
    }),
  ).toThrow(
    'audit-ignores.json needs a package, a reason and an ISO expires date for GHSA-85c8-ppgw-ccpr',
  );
});
