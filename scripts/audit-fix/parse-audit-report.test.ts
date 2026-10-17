import { expect, test } from 'bun:test';
import { parseAuditReport } from './parse-audit-report.ts';

test('it keeps the fields the step uses from each advisory', () => {
  const report = parseAuditReport({
    tinypool: [
      {
        id: 1_241_261,
        url: 'https://github.com/advisories/GHSA-85c8-ppgw-ccpr',
        title: 'Tinypool: Prototype Pollution Gadget to RCE in run() options',
        severity: 'critical',
        vulnerable_versions: '<2.1.2',
        cwe: ['CWE-94'],
      },
    ],
  });

  expect(report).toStrictEqual({
    tinypool: [
      {
        id: 1_241_261,
        url: 'https://github.com/advisories/GHSA-85c8-ppgw-ccpr',
        title: 'Tinypool: Prototype Pollution Gadget to RCE in run() options',
        severity: 'critical',
        vulnerable_versions: '<2.1.2',
      },
    ],
  });
});

test('it rejects an advisory with an unknown severity', () => {
  expect(() =>
    parseAuditReport({
      tinypool: [{ id: 1, url: 'u', title: 't', severity: 'severe', vulnerable_versions: '<2' }],
    }),
  ).toThrow('bun audit --json has a malformed advisory for tinypool');
});

test('it rejects a package whose advisories are not a list', () => {
  expect(() => parseAuditReport({ tinypool: {} })).toThrow(
    'bun audit --json lists no advisories for tinypool',
  );
});
