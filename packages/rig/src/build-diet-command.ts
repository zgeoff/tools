// A command under diet's cap. diet's own script runs by path through bash, so the cap never
// depends on a PATH lookup.
export function buildDietCommand(
  dietScript: string,
  memory: string | null,
  command: readonly string[],
): readonly string[] {
  const budget = memory === null ? [] : ['--budget', memory];

  return ['bash', dietScript, ...budget, '--', ...command];
}
