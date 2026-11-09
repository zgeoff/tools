// A check script's output streams to the step's log as it runs, so the runner leaves the child's
// output on this process's own.
export function makeBunScriptRunner(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): (name: string) => Promise<number> {
  return (name) =>
    Bun.spawn(['bun', 'run', name], { cwd, env: { ...env }, stdout: 'inherit', stderr: 'inherit' })
      .exited;
}
