// A clock that starts at 0 and moves by the step at each read, so two reads around a call are one
// step apart.
export function buildTickingClock(stepMs: number): () => number {
  const time = { nowMs: 0 };

  return () => {
    time.nowMs += stepMs;

    return time.nowMs;
  };
}
