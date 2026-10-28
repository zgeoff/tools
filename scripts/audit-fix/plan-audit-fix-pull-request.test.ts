import { expect, test } from 'bun:test';
import { planAuditFixPullRequest } from './plan-audit-fix-pull-request.ts';

test('it creates a labelled pull request and turns auto-merge on for a fix with no ignore', () => {
  const plan = planAuditFixPullRequest({
    needsReview: false,
    openNumber: null,
    isAutomerge: true,
    base: 'main',
    branch: 'audit-fix',
    title: 'fix(deps): patch kettle',
    bodyFile: '/runner/body.md',
  });

  expect(plan.commands).toStrictEqual([
    { args: ['label', 'create', 'dependencies'], mustSucceed: false },
    { args: ['label', 'create', 'security'], mustSucceed: false },
    {
      args: [
        'pr',
        'create',
        '--base',
        'main',
        '--head',
        'audit-fix',
        '--title',
        'fix(deps): patch kettle',
        '--body-file',
        '/runner/body.md',
        '--label',
        'dependencies,security',
      ],
      mustSucceed: true,
    },
  ]);

  expect(plan.waitsForReview).toBeFalse();
  expect(plan.turnsAutoMergeOn).toBeTrue();
});

test('it edits the open pull request and drops the audit-ignore label of an earlier run', () => {
  const plan = planAuditFixPullRequest({
    needsReview: false,
    openNumber: 41,
    isAutomerge: false,
    base: 'main',
    branch: 'audit-fix',
    title: 'fix(deps): patch kettle',
    bodyFile: '/runner/body.md',
  });

  expect(plan.commands).toStrictEqual([
    { args: ['label', 'create', 'dependencies'], mustSucceed: false },
    { args: ['label', 'create', 'security'], mustSucceed: false },
    {
      args: [
        'pr',
        'edit',
        '41',
        '--title',
        'fix(deps): patch kettle',
        '--body-file',
        '/runner/body.md',
        '--add-label',
        'dependencies,security',
      ],
      mustSucceed: true,
    },
    { args: ['pr', 'edit', '41', '--remove-label', 'audit-ignore'], mustSucceed: false },
  ]);

  expect(plan.waitsForReview).toBeFalse();
  expect(plan.turnsAutoMergeOn).toBeFalse();
});

test('it labels a change that adds an ignore for review and never turns auto-merge on', () => {
  const plan = planAuditFixPullRequest({
    needsReview: true,
    openNumber: 41,
    isAutomerge: true,
    base: 'main',
    branch: 'audit-fix',
    title: 'fix(deps): ignore kettle',
    bodyFile: '/runner/body.md',
  });

  expect(plan.commands).toStrictEqual([
    { args: ['label', 'create', 'dependencies'], mustSucceed: false },
    { args: ['label', 'create', 'security'], mustSucceed: false },
    { args: ['label', 'create', 'audit-ignore'], mustSucceed: false },
    {
      args: [
        'pr',
        'edit',
        '41',
        '--title',
        'fix(deps): ignore kettle',
        '--body-file',
        '/runner/body.md',
        '--add-label',
        'dependencies,security,audit-ignore',
      ],
      mustSucceed: true,
    },
  ]);

  expect(plan.waitsForReview).toBeTrue();
  expect(plan.turnsAutoMergeOn).toBeFalse();
});

test('it creates a pull request that waits for review when a first fix adds an ignore', () => {
  const plan = planAuditFixPullRequest({
    needsReview: true,
    openNumber: null,
    isAutomerge: false,
    base: 'main',
    branch: 'audit-fix',
    title: 'fix(deps): ignore kettle',
    bodyFile: '/runner/body.md',
  });

  expect(plan.commands.at(-1)).toStrictEqual({
    args: [
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'audit-fix',
      '--title',
      'fix(deps): ignore kettle',
      '--body-file',
      '/runner/body.md',
      '--label',
      'dependencies,security,audit-ignore',
    ],
    mustSucceed: true,
  });

  expect(plan.waitsForReview).toBeTrue();
  expect(plan.turnsAutoMergeOn).toBeFalse();
});
