import { simpleGit } from 'simple-git';

// CLAUDE_PROJECT_DIR is Claude Code's. Codex sets none, so the project is the git top level of the
// session's working directory, or that directory itself outside a repo.
export async function readProjectDir(cwd: string): Promise<string> {
  const fromEnv = process.env['CLAUDE_PROJECT_DIR'];

  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }

  try {
    const output = await simpleGit(cwd).revparse(['--show-toplevel']);

    const topLevel = output.trim();

    return topLevel === '' ? cwd : topLevel;
  } catch {
    return cwd;
  }
}
