// Returns a function that answers each call with the next of the answers, in order, and with the
// last one again once they run out.
export function makeAnswerQueue<T>(answers: readonly [T, ...T[]]): () => T {
  let calls = 0;

  return () => {
    const answer = answers[Math.min(calls, answers.length - 1)] ?? answers[0];

    calls += 1;

    return answer;
  };
}
