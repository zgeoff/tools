import invariant from 'tiny-invariant';

// Returns a function that answers each call with the next of the answers, in order, and with the
// last one again once they run out. An answer may be null or undefined.
export function makeAnswerQueue<T>(answers: readonly [T, ...T[]]): () => T {
  const boxes = answers.map((value) => ({ value }));
  let calls = 0;

  return () => {
    const box = boxes[Math.min(calls, boxes.length - 1)];

    invariant(box !== undefined, 'the answer queue holds at least one answer');

    calls += 1;

    return box.value;
  };
}
