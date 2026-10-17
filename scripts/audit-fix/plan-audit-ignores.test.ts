import { expect, test } from 'bun:test';
import { planAuditIgnores } from './plan-audit-ignores.ts';

const tinypoolAdvisory = {
  id: 1_241_261,
  url: 'https://github.com/advisories/GHSA-85c8-ppgw-ccpr',
  title: 'Tinypool: Prototype Pollution Gadget to RCE in run() options',
  severity: 'critical',
  vulnerable_versions: '<2.1.2',
} as const;

const blockedPlan = {
  fixes: [],
  blocked: [
    {
      name: 'tinypool',
      from: '2.1.0',
      to: '2.1.2',
      blockers: [{ dependent: 'oxfmt@0.56.0', range: '2.1.0' }],
    },
  ],
  unfixable: [],
};

test('it ignores an advisory the fix could not reach, naming the dependent that blocks it', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {},
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan).toStrictEqual({
    ignores: {
      'GHSA-85c8-ppgw-ccpr': {
        package: 'tinypool',
        reason: 'The fix is tinypool 2.1.2, but oxfmt@0.56.0 accepts only 2.1.0.',
        expires: '2026-11-16',
      },
    },
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
});

test('it says no release fixes an advisory the fix marks unfixable', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {},
    unmanagedIDs: [],
    plan: { fixes: [], blocked: [], unfixable: [{ name: 'tinypool' }] },
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan.added[0]?.reason).toBe('No published release of tinypool fixes it.');
});

test('it keys an advisory with no GHSA ID by its numeric ID', () => {
  const plan = planAuditIgnores({
    report: {
      tinypool: [{ ...tinypoolAdvisory, url: 'https://registry.example/advisories/1241261' }],
    },
    ignores: {},
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(Object.keys(plan.ignores)).toStrictEqual(['1241261']);
});

test('it keeps an ignore that has not expired', () => {
  const ignore = { package: 'tinypool', reason: 'Waiting on oxfmt.', expires: '2026-11-01' };

  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: { 'GHSA-85c8-ppgw-ccpr': ignore },
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan).toStrictEqual({
    ignores: { 'GHSA-85c8-ppgw-ccpr': ignore },
    added: [],
    renewed: [],
    removed: [],
  });
});

test('it renews an expired ignore whose advisory the fix still could not reach', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {
      'GHSA-85c8-ppgw-ccpr': {
        package: 'tinypool',
        reason: 'Waiting on oxfmt.',
        expires: '2026-10-17',
      },
    },
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan.renewed).toStrictEqual([
    {
      advisory: 'GHSA-85c8-ppgw-ccpr',
      title: 'Tinypool: Prototype Pollution Gadget to RCE in run() options',
      package: 'tinypool',
      reason: 'The fix is tinypool 2.1.2, but oxfmt@0.56.0 accepts only 2.1.0.',
      expires: '2026-11-16',
    },
  ]);
});

test('it drops an ignore whose advisory the audit no longer reports', () => {
  const plan = planAuditIgnores({
    report: {},
    ignores: {
      'GHSA-85c8-ppgw-ccpr': {
        package: 'tinypool',
        reason: 'Waiting on oxfmt.',
        expires: '2026-11-01',
      },
    },
    unmanagedIDs: [],
    plan: { fixes: [], blocked: [], unfixable: [] },
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan).toStrictEqual({
    ignores: {},
    added: [],
    renewed: [],
    removed: ['GHSA-85c8-ppgw-ccpr'],
  });
});

test('it leaves an advisory alone that the audit script already ignores without an entry', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {},
    unmanagedIDs: ['GHSA-85c8-ppgw-ccpr'],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan).toStrictEqual({ ignores: {}, added: [], renewed: [], removed: [] });
});

test('it adds no ignore for an advisory below the audit level', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [{ ...tinypoolAdvisory, severity: 'moderate' }] },
    ignores: {},
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: 'high',
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan.added).toBeEmpty();
});

test('it renews an ignore set further out than 90 days, so it comes back for review', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {
      'GHSA-85c8-ppgw-ccpr': { package: 'tinypool', reason: 'Forever.', expires: '9999-12-31' },
    },
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 30,
    pending: {},
  });

  expect(plan.renewed.map((change) => change.expires)).toStrictEqual(['2026-11-16']);
});

test('it caps the expiry of a new ignore at 90 days', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {},
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-17',
    expiryDays: 3650,
    pending: {},
  });

  expect(plan.ignores['GHSA-85c8-ppgw-ccpr']?.expires).toBe('2027-01-15');
});

test('it keeps the expiry the open fix branch already holds for a new ignore', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {},
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-18',
    expiryDays: 30,
    pending: {
      'GHSA-85c8-ppgw-ccpr': { package: 'tinypool', reason: 'Earlier run.', expires: '2026-11-16' },
    },
  });

  expect(plan.added.map((change) => change.expires)).toStrictEqual(['2026-11-16']);
});

test('it ignores an open fix branch expiry set further out than 90 days', () => {
  const plan = planAuditIgnores({
    report: { tinypool: [tinypoolAdvisory] },
    ignores: {},
    unmanagedIDs: [],
    plan: blockedPlan,
    auditLevel: null,
    today: '2026-10-18',
    expiryDays: 30,
    pending: {
      'GHSA-85c8-ppgw-ccpr': { package: 'tinypool', reason: 'Edited.', expires: '9999-12-31' },
    },
  });

  expect(plan.added.map((change) => change.expires)).toStrictEqual(['2026-11-17']);
});
