import { expect, test } from 'bun:test';
import { renderAuditFixSummary } from './render-audit-fix-summary.ts';

const tinypoolIgnore = {
  advisory: 'GHSA-85c8-ppgw-ccpr',
  title: 'Tinypool: Prototype Pollution Gadget to RCE in run() options',
  package: 'tinypool',
  reason: 'The fix is tinypool 2.1.2, but oxfmt@0.56.0 accepts only 2.1.0.',
  expires: '2026-11-16',
};

test('it titles a change that updates a package as a fix', () => {
  const summary = renderAuditFixSummary({
    fixes: [
      { name: 'brace-expansion', from: '5.0.6', to: '5.0.12', newerThanMinimumReleaseAge: true },
    ],
    excludes: [
      {
        name: 'brace-expansion',
        version: '5.0.12',
        publishedOn: '2026-10-15',
        agesPastGateOn: '2026-10-22',
        advisories: ['GHSA-q2hr-2g5m-vwhr'],
      },
    ],
    added: [tinypoolIgnore],
    renewed: [],
    removed: [],
  });

  expect(summary).toStrictEqual({
    title:
      'fix(deps): update brace-expansion to fix audit advisories and ignore 1 unfixed advisory',
    body: `The audit-fix workflow opened this pull request after it ran \`bun audit\` on the default branch.

## Updated to a fixed release
- \`brace-expansion\` 5.0.6 → 5.0.12

## Release-age excludes
These fixes are younger than \`minimumReleaseAge\`, so \`bunfig.toml\` excludes them from the gate until they age past it.
- \`brace-expansion\` 5.0.12, published 2026-10-15; remove the exclude on or after 2026-10-22

## Ignored until a fix can land
- GHSA-85c8-ppgw-ccpr in \`tinypool\` (Tinypool: Prototype Pollution Gadget to RCE in run() options), until 2026-11-16: The fix is tinypool 2.1.2, but oxfmt@0.56.0 accepts only 2.1.0.
`,
    kind: 'fix',
  });
});

test('it titles a change that only records ignores as a chore', () => {
  const summary = renderAuditFixSummary({
    fixes: [],
    excludes: [],
    added: [],
    renewed: [tinypoolIgnore],
    removed: [],
  });

  expect(summary.title).toBe('chore(deps): ignore 1 unfixed audit advisory until a fix can land');
  expect(summary.kind).toBe('ignore');
});

test('it titles a change that only drops ignores', () => {
  const summary = renderAuditFixSummary({
    fixes: [],
    excludes: [],
    added: [],
    renewed: [],
    removed: ['GHSA-85c8-ppgw-ccpr', 'GHSA-5gmw-xhrv-c9v3'],
  });

  expect(summary.title).toBe('chore(deps): drop 2 audit ignores that no longer match');
});

test('it reports nothing when nothing changed', () => {
  expect(
    renderAuditFixSummary({ fixes: [], excludes: [], added: [], renewed: [], removed: [] }),
  ).toStrictEqual({
    title: '',
    body: '',
    kind: 'none',
  });
});
