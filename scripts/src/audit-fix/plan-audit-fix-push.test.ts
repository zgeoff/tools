import { expect, test } from 'bun:test';
import { planAuditFixPush } from './plan-audit-fix-push.ts';

test.each([
  [
    'an open pull request and a new tree',
    41,
    false,
    { disablesAutoMerge: true, pushes: true, logLines: [] },
  ],
  [
    'no open pull request and a new tree',
    null,
    false,
    { disablesAutoMerge: false, pushes: true, logLines: [] },
  ],
  [
    'an open pull request that already holds the tree',
    41,
    true,
    {
      disablesAutoMerge: true,
      pushes: false,
      logLines: ['The open fix already holds this change.\n'],
    },
  ],
  [
    'no open pull request and the same tree',
    null,
    true,
    {
      disablesAutoMerge: false,
      pushes: false,
      logLines: ['The open fix already holds this change.\n'],
    },
  ],
])('it plans the push for %s', (_label, openNumber, isSameTree, expected) => {
  expect(planAuditFixPush({ openNumber, isSameTree })).toStrictEqual(expected);
});
