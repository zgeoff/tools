import { expect, spyOn, test } from 'bun:test';
import { writeStdout } from './write-stdout.ts';

function setupTest() {
  const write = spyOn(process.stdout, 'write').mockImplementation(() => true);

  return { write };
}

test('it writes the text to stdout as it is', () => {
  const ctx = setupTest();

  writeStdout('::warning::the kettle is cold\n');

  const calls = ctx.write.mock.calls;

  ctx.write.mockRestore();

  expect(calls).toStrictEqual([['::warning::the kettle is cold\n']]);
});
