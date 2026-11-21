import { expect, test } from 'bun:test';
import { readGitEnv } from './read-git-env.ts';

test('it keeps PATH, sets HOME, hides the git config, and fixes the commit identity', () => {
  expect(readGitEnv('/home/kestrel', { PATH: '/usr/bin' })).toStrictEqual({
    PATH: '/usr/bin',
    HOME: '/home/kestrel',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '4',
    GIT_CONFIG_KEY_0: 'commit.gpgsign',
    GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'tag.gpgsign',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'maintenance.auto',
    GIT_CONFIG_VALUE_2: 'false',
    GIT_CONFIG_KEY_3: 'init.defaultBranch',
    GIT_CONFIG_VALUE_3: 'main',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
});

test('it points mise at the data and state folders of the real home', () => {
  const env = readGitEnv('/scratch/test-home', { PATH: '/usr/bin', HOME: '/home/wren' });

  expect(env['MISE_DATA_DIR']).toBe('/home/wren/.local/share/mise');
  expect(env['MISE_STATE_DIR']).toBe('/home/wren/.local/state/mise');
});

test('it takes the mise folders from the XDG folders of the real home', () => {
  const env = readGitEnv('/scratch/test-home', {
    HOME: '/home/wren',
    XDG_DATA_HOME: '/data/wren',
    XDG_STATE_HOME: '/state/wren',
  });

  expect(env['MISE_DATA_DIR']).toBe('/data/wren/mise');
  expect(env['MISE_STATE_DIR']).toBe('/state/wren/mise');
});

test('it keeps mise folders that the real environment sets', () => {
  const env = readGitEnv('/scratch/test-home', {
    HOME: '/home/wren',
    MISE_DATA_DIR: '/opt/mise/data',
    MISE_STATE_DIR: '/opt/mise/state',
  });

  expect(env['MISE_DATA_DIR']).toBe('/opt/mise/data');
  expect(env['MISE_STATE_DIR']).toBe('/opt/mise/state');
});

test('it replaces a GIT_CONFIG_COUNT and the config variables of the outer env', () => {
  const env = readGitEnv('/scratch/test-home', {
    PATH: '/usr/bin',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'user.signingkey',
    GIT_CONFIG_VALUE_0: 'ABCDEF',
    GIT_DIR: '/real/repo/.git',
  });

  expect(env).toStrictEqual(readGitEnv('/scratch/test-home', { PATH: '/usr/bin' }));
});
