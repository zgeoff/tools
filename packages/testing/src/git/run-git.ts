import type { GitEnv } from './read-git-env.ts';

// Runs git and resolves with its stdout. Rejects with git's stderr when git exits non-zero.
export async function runGit(cwd: string, env: GitEnv, args: readonly string[]): Promise<string> {
  const subprocess = Bun.spawn(['git', ...args], { cwd, env, stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }

  return stdout;
}
