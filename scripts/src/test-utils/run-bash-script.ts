import { $ } from 'bun';

export interface BashScriptRun {
  readonly script: string;
  readonly args: readonly string[];

  // Stand-ins in this folder come first on PATH.
  readonly stubDirectory: string;
  readonly env: Readonly<Record<string, string>>;

  // The script's working directory; unset: this process's.
  readonly cwd?: string;
}

export interface BashScriptResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// Runs the script with bash, the caller's env on top of this process's, and
// never throws on a failed exit.
export async function runBashScript(run: BashScriptRun): Promise<BashScriptResult> {
  const result = await $`bash ${run.script} ${run.args}`
    .cwd(run.cwd ?? process.cwd())
    .env({ ...process.env, PATH: `${run.stubDirectory}:${process.env['PATH']}`, ...run.env })
    .nothrow()
    .quiet();

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
