import type { GitEnv } from './read-git-env.ts';

export async function readGitHead(repo: string, env: GitEnv): Promise<string> {
  const subprocess = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
    cwd: repo,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${stderr}`);
  }

  return stdout.trim();
}
