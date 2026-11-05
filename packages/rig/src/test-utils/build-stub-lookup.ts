import { mock } from 'bun:test';

// Stands in for a read keyed by a path: it answers each key the test lists, gives the missing
// answer for any other key, and records each call.
export function buildStubLookup<Answer>(
  answers: Readonly<Record<string, Answer>>,
  missing: Answer,
) {
  return mock((key: string): Promise<Answer> => {
    const entry = Object.entries(answers).find(([listedKey]) => listedKey === key);
    const answer = entry === undefined ? missing : entry[1];

    return Promise.resolve(answer);
  });
}
