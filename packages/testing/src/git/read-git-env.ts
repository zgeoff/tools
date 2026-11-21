import { join } from 'node:path';

const gitConfig = [
  ['commit.gpgsign', 'false'],
  ['tag.gpgsign', 'false'],
  ['maintenance.auto', 'false'],
  ['init.defaultBranch', 'main'],
] as const;

export type GitEnv = Readonly<Record<string, string | undefined>>;

// Takes only PATH and the mise folders from outerEnv, so the user's git config, signing key and
// hooks never reach a test repo. A pre-push hook in a linked worktree exports GIT_DIR, which would
// point a test's git calls at the real repository.
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
    GIT_CONFIG_COUNT: String(gitConfig.length),
    ...Object.fromEntries(
      gitConfig.flatMap(([key, value], index) => [
        [`GIT_CONFIG_KEY_${index}`, key],
        [`GIT_CONFIG_VALUE_${index}`, value],
      ]),
    ),
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
