import { join } from 'node:path';

export type GitEnv = Readonly<Record<string, string | undefined>>;

// A clean environment: a pre-push hook in a linked worktree exports GIT_DIR, which would point a
// test's git calls at the real repository.
export function readGitEnv(home: string, outerEnv: GitEnv = process.env): GitEnv {
  return {
    PATH: outerEnv['PATH'],
    HOME: home,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    ...buildMiseEnv(outerEnv),
  };
}

// A tool on PATH can be a mise shim. mise keeps its installs and the configs it trusts under HOME,
// so a shim run with the test's HOME refuses the real global config as untrusted.
function buildMiseEnv(outerEnv: GitEnv): GitEnv {
  const realHome = outerEnv['HOME'];

  if (realHome === undefined) {
    return {};
  }

  return {
    MISE_DATA_DIR:
      outerEnv['MISE_DATA_DIR'] ??
      join(outerEnv['XDG_DATA_HOME'] ?? join(realHome, '.local', 'share'), 'mise'),
    MISE_STATE_DIR:
      outerEnv['MISE_STATE_DIR'] ??
      join(outerEnv['XDG_STATE_HOME'] ?? join(realHome, '.local', 'state'), 'mise'),
  };
}
