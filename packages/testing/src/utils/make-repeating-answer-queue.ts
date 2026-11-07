// Returns a function that answers each call with the next of the answers, in order, and with the
// last one again once they run out. Use it for code that polls until a deadline, where the number
// of calls depends on the clock. An answer may be null or undefined.
export function makeRepeatingAnswerQueue<T>(answers: readonly [T, ...T[]]): () => T {
  const boxes = answers.map((value) => ({ value }));
  let calls = 0;

  return () => {
    const box = boxes[Math.min(calls, boxes.length - 1)];

    if (box === undefined) {
      throw new Error('the answer queue holds no answer');
    }

    calls += 1;

    return box.value;
  };
}
