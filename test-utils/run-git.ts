import type { GitEnv } from './read-git-env.ts';

export async function runGit(cwd: string, env: GitEnv, args: readonly string[]): Promise<void> {
  const subprocess = Bun.spawn(['git', ...args], { cwd, env, stdout: 'ignore', stderr: 'pipe' });

  if ((await subprocess.exited) !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${await new Response(subprocess.stderr).text()}`,
    );
  }
}
