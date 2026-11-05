// A bench run that stays in flight for one microtask, and records how many calls were in flight as
// each call started.
export function buildInFlightRun() {
  const state = { inFlight: 0 };
  const inFlightAtStart: number[] = [];

  return {
    inFlightAtStart,
    run: async () => {
      state.inFlight += 1;

      inFlightAtStart.push(state.inFlight);

      await Promise.resolve();

      state.inFlight -= 1;
    },
  };
}
