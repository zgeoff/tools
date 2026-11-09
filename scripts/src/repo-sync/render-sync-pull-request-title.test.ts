import { expect, test } from 'bun:test';
import { renderSyncPullRequestTitle } from './render-sync-pull-request-title.ts';

test.each([
  [['skill-testing'], 'chore(sync): update the testing skill'],
  [
    ['workflow-bun-pr', 'hook-skill-gate'],
    'chore(sync): update the bun-pr workflow and the skill-gate hook',
  ],
  [['editorconfig', 'retired-files'], 'chore(sync): update the editorconfig and the retired files'],
  [['socket', 'pr-template', 'skill-ci-design'], 'chore(sync): update 3 shared entries'],
  [['pre-push-baseline', 'workflow-repo-sync-guard'], 'chore(sync): update 2 shared entries'],
  [['tools-pins'], 'chore(sync): update the zgeoff/tools pins'],
])('it names the synced entries %j in the title', (names, expected) => {
  const title = renderSyncPullRequestTitle(
    names.map((name) => ({ name, description: 'A shared file' })),
  );

  expect(title).toBe(expected);
});
