export type GitEnv = Readonly<Record<string, string | undefined>>;

// A clean environment: a pre-push hook in a linked worktree exports GIT_DIR, which would point a
// test's git calls at the real repository.
export function readGitEnv(home: string): GitEnv {
  return {
    PATH: process.env['PATH'],
    HOME: home,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
}
