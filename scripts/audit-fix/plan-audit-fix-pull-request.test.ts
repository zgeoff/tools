import { expect, test } from 'bun:test';
import { planAuditFixPullRequest } from './plan-audit-fix-pull-request.ts';

test('it creates a labelled pull request and turns auto-merge on for a fix with no ignore', () => {
  const plan = planAuditFixPullRequest({ needsReview: false, openNumber: null, isAutomerge: true });

  expect(plan).toStrictEqual({
    labels: ['dependencies', 'security'],
    write: { kind: 'create' },
    waitsForReview: false,
    turnsAutoMergeOn: true,
  });
});

test('it edits the open pull request and drops the audit-ignore label of an earlier run', () => {
  const plan = planAuditFixPullRequest({ needsReview: false, openNumber: 41, isAutomerge: false });

  expect(plan).toStrictEqual({
    labels: ['dependencies', 'security'],
    write: { kind: 'edit', number: 41, removesIgnoreLabel: true },
    waitsForReview: false,
    turnsAutoMergeOn: false,
  });
});

test('it labels a change that adds an ignore for review and never turns auto-merge on', () => {
  const plan = planAuditFixPullRequest({ needsReview: true, openNumber: 41, isAutomerge: true });

  expect(plan).toStrictEqual({
    labels: ['dependencies', 'security', 'audit-ignore'],
    write: { kind: 'edit', number: 41, removesIgnoreLabel: false },
    waitsForReview: true,
    turnsAutoMergeOn: false,
  });
});

test('it creates a pull request that waits for review when a first fix adds an ignore', () => {
  const plan = planAuditFixPullRequest({ needsReview: true, openNumber: null, isAutomerge: false });

  expect(plan).toStrictEqual({
    labels: ['dependencies', 'security', 'audit-ignore'],
    write: { kind: 'create' },
    waitsForReview: true,
    turnsAutoMergeOn: false,
  });
});
