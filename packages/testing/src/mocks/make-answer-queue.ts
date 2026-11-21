// Returns a function that answers each call with the next of the answers, in order. A call past
// the last answer throws, so a test fails when the code under test asks more often than expected.
// An answer may be null or undefined.
export function makeAnswerQueue<T>(answers: readonly T[]): () => T {
  const boxes = answers.map((value) => ({ value }));
  let calls = 0;

  return () => {
    const box = boxes[calls];

    if (box === undefined) {
      throw new Error(`the answer queue ran out after ${boxes.length} answer(s)`);
    }

    calls += 1;

    return box.value;
  };
}
