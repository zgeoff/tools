// `ps` prints a zombie's state with a leading Z, such as `Z` or `Z+`.
export function isZombieState(state: string): boolean {
  return state.startsWith('Z');
}
