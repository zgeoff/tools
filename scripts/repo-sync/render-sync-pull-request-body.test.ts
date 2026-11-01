import { expect, test } from 'bun:test';
import { buildMockSyncEntry } from '../../test-utils/build-mock-sync-entry.ts';
import { renderSyncPullRequestBody } from './render-sync-pull-request-body.ts';

test('it names only the tools commit when no entry reads zgeoff/skills', () => {
  const body = renderSyncPullRequestBody({
    commit: '0123456789abcdef0123456789abcdef01234567',
    skillsCommit: '89abcdef0123456789abcdef0123456789abcdef',
    entries: [buildMockSyncEntry()],
    synced: [{ name: 'editorconfig', description: 'The editor config' }],
  });

  expect(body).toBe(
    'Copied from zgeoff/tools at 0123456789abcdef0123456789abcdef01234567 by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n- `editorconfig`: The editor config',
  );
});

test('it names the zgeoff/skills commit when an entry reads that repo', () => {
  const body = renderSyncPullRequestBody({
    commit: '0123456789abcdef0123456789abcdef01234567',
    skillsCommit: '89abcdef0123456789abcdef0123456789abcdef',
    entries: [
      buildMockSyncEntry({
        name: 'skill-kettle',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
        ],
      }),
    ],
    synced: [{ name: 'skill-kettle', description: 'The kettle skill' }],
  });

  expect(body).toBe(
    'Copied from zgeoff/tools at 0123456789abcdef0123456789abcdef01234567, and the skill text from zgeoff/skills at 89abcdef0123456789abcdef0123456789abcdef, by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n- `skill-kettle`: The kettle skill',
  );
});
