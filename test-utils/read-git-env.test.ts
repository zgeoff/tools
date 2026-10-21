import { expect, test } from 'bun:test';
import { readGitEnv } from './read-git-env.ts';

test('it keeps PATH, sets HOME, hides the git config, and fixes the commit identity', () => {
  expect(readGitEnv('/home/kestrel')).toStrictEqual({
    PATH: process.env['PATH'],
    HOME: '/home/kestrel',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
});
