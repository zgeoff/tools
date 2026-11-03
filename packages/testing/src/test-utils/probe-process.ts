// Tells whether a process still runs. A zombie, which only waits for its parent to collect it,
// counts as gone.
export function probeProcess(pid: number): boolean {
  const state = Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(pid)])
    .stdout.toString()
    .trim();

  return state !== '' && !state.startsWith('Z');
}
