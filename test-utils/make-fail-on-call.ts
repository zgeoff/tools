// Wraps an effect so that the call with the given number, counting from 1, rejects with the message
// in place of running, and every other call runs the effect.
export function makeFailOnCall<Args extends unknown[]>(
  effect: (...args: Args) => Promise<void>,
  failingCall: number,
  message: string,
): (...args: Args) => Promise<void> {
  let calls = 0;

  return (...args) => {
    calls += 1;

    return calls === failingCall ? Promise.reject(new Error(message)) : effect(...args);
  };
}
