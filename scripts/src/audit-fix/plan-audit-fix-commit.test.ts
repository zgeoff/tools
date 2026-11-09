import { expect, test } from 'bun:test';
import { planAuditFixCommit } from './plan-audit-fix-commit.ts';

test('it deletes the fix branch and writes pushed=false when the audit staged nothing', () => {
  const plan = planAuditFixCommit({ hasStagedChange: false, titleText: '', reviewText: '' });

  expect(plan).toStrictEqual({
    logLines: ['bun audit passes with nothing to change; nothing to fix.\n'],
    exitCode: 0,
    deletesBranch: true,
    pushedOutput: 'false',
    commitMessage: null,
    readsOpenPullRequest: false,
  });
});

test.each([
  ['an empty title', ''],
  ['a title of blank lines', '\n\n'],
])('it fails and commits nothing when the audit staged a change with %s', (_label, titleText) => {
  const plan = planAuditFixCommit({ hasStagedChange: true, titleText, reviewText: 'false\n' });

  expect(plan).toStrictEqual({
    logLines: ['::error::audit-fix changed files but wrote no pull-request title\n'],
    exitCode: 1,
    deletesBranch: false,
    pushedOutput: null,
    commitMessage: null,
    readsOpenPullRequest: false,
  });
});

test.each([
  ['a fix that needs review', 'true\n', true],
  ['a fix that needs no review', 'false\n', false],
  ['a fix with no review file', '', false],
])(
  'it commits under the title without its trailing newlines for %s',
  (_label, reviewText, readsOpenPullRequest) => {
    const plan = planAuditFixCommit({
      hasStagedChange: true,
      titleText: 'fix(deps): update kettle to 1.0.1\n\n',
      reviewText,
    });

    expect(plan).toStrictEqual({
      logLines: [],
      exitCode: 0,
      deletesBranch: false,
      pushedOutput: null,
      commitMessage: 'fix(deps): update kettle to 1.0.1',
      readsOpenPullRequest,
    });
  },
);
