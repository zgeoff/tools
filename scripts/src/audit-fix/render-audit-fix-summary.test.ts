import { expect, test } from 'bun:test';
import { renderAuditFixSummary } from './render-audit-fix-summary.ts';

test('it titles a change that updates a package as a fix', () => {
  const summary = renderAuditFixSummary({
    fixes: [
      { name: 'brace-expansion', from: '5.0.6', to: '5.0.12', newerThanMinimumReleaseAge: true },
    ],
    expiredExcludes: [],
    excludes: [
      {
        name: 'brace-expansion',
        version: '5.0.12',
        publishedOn: '2026-10-15',
        agesPastGateOn: '2026-10-22',
        advisories: ['GHSA-q2hr-2g5m-vwhr'],
      },
    ],
    added: [
      {
        advisory: 'GHSA-85c8-ppgw-ccpr',
        title: 'Tinypool: Prototype Pollution Gadget to RCE in run() options',
        package: 'tinypool',
        reason: 'The fix is tinypool 2.1.2, but oxfmt@0.56.0 accepts only 2.1.0.',
        expires: '2026-11-16',
      },
    ],
    renewed: [],
    removed: [],
  });

  expect(summary).toStrictEqual({
    title: 'fix(deps): update brace-expansion, ignore 1 unfixed advisory',
    body: `The audit-fix workflow opened this pull request after it ran \`bun audit\` on the base branch. It ignores advisories that no fix reaches, so it waits for a person to review it and never merges by itself.

## Updated to a fixed release
- \`brace-expansion\` 5.0.6 → 5.0.12

## Release-age excludes
These fixes are younger than \`minimumReleaseAge\`, so \`bunfig.toml\` excludes them from the gate until they age past it.
- \`brace-expansion\` 5.0.12, published 2026-10-15; remove the exclude on or after 2026-10-22

## Ignored until a fix can land
- GHSA-85c8-ppgw-ccpr in \`tinypool\` (Tinypool: Prototype Pollution Gadget to RCE in run() options), until 2026-11-16: The fix is tinypool 2.1.2, but oxfmt@0.56.0 accepts only 2.1.0.
`,
    needsReview: true,
  });
});

test('it titles a change that only records ignores as a chore', () => {
  const summary = renderAuditFixSummary({
    fixes: [],
    excludes: [],
    expiredExcludes: [],
    added: [],
    renewed: [
      {
        advisory: 'GHSA-85c8-ppgw-ccpr',
        title: 'Tinypool: Prototype Pollution Gadget to RCE in run() options',
        package: 'tinypool',
        reason: 'The fix is tinypool 2.1.2, but oxfmt@0.56.0 accepts only 2.1.0.',
        expires: '2026-11-16',
      },
    ],
    removed: [],
  });

  expect(summary.title).toBe('chore(deps): ignore 1 unfixed audit advisory');
  expect(summary.needsReview).toBe(true);
});

test('it titles a change that only drops ignores', () => {
  const summary = renderAuditFixSummary({
    fixes: [],
    excludes: [],
    expiredExcludes: [],
    added: [],
    renewed: [],
    removed: ['GHSA-85c8-ppgw-ccpr', 'GHSA-5gmw-xhrv-c9v3'],
  });

  expect(summary.title).toBe('chore(deps): drop 2 stale audit ignores');
});

test('it counts the packages when their names would make the title too long', () => {
  const summary = renderAuditFixSummary({
    fixes: ['@modelcontextprotocol/sdk', 'http-cache-semantics', 'source-map-js'].map((name) => ({
      name,
      from: '1.0.0',
      to: '1.0.1',
      newerThanMinimumReleaseAge: false,
    })),
    excludes: [],
    expiredExcludes: [],
    added: [],
    renewed: [],
    removed: [],
  });

  expect(summary.title).toBe('fix(deps): update 3 packages to fix advisories');
});

test('it reports nothing when nothing changed', () => {
  expect(
    renderAuditFixSummary({
      fixes: [],
      excludes: [],
      expiredExcludes: [],
      added: [],
      renewed: [],
      removed: [],
    }),
  ).toStrictEqual({
    title: '',
    body: '',
    needsReview: false,
  });
});

test('it lets a change that only updates packages merge by itself', () => {
  const summary = renderAuditFixSummary({
    fixes: [
      { name: 'brace-expansion', from: '5.0.6', to: '5.0.12', newerThanMinimumReleaseAge: false },
    ],
    excludes: [],
    expiredExcludes: [],
    added: [],
    renewed: [],
    removed: [],
  });

  expect(summary.needsReview).toBe(false);
});

test('it titles a change that only drops aged release-age excludes', () => {
  const summary = renderAuditFixSummary({
    fixes: [],
    excludes: [],
    expiredExcludes: ['hono'],
    added: [],
    renewed: [],
    removed: [],
  });

  expect(summary).toStrictEqual({
    title: 'chore(deps): drop 1 aged release-age exclude',
    body: `The audit-fix workflow opened this pull request after it ran \`bun audit\` on the base branch.

## Release-age excludes dropped, because each release aged past the gate
- \`hono\`
`,
    needsReview: false,
  });
});
