import { expect, test } from 'bun:test';
import { buildAuditFixPaths } from './build-audit-fix-paths.ts';

test('it puts the fix of the default branch on audit-fix, beside its files in the runner folder', () => {
  const paths = buildAuditFixPaths('/runner/temp', 'main', 'main');

  expect(paths).toStrictEqual({
    branch: 'audit-fix',
    title: '/runner/temp/title.txt',
    body: '/runner/temp/body.md',
    review: '/runner/temp/needs-review.txt',
    pendingIgnores: '/runner/temp/pending-ignores.json',
    pullRequestBody: '/runner/temp/pr-body.md',
  });
});

test('it gives another base its own fix branch, with each slash turned into a dash', () => {
  const paths = buildAuditFixPaths('/runner/temp', 'release/v2/next', 'main');

  expect(paths.branch).toBe('audit-fix-release-v2-next');
});
