import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { writeStdout } from './write-stdout.ts';

function setupTest() {
  const write = spyOn(process.stdout, 'write').mockImplementation(() => true);

  onTestFinished(() => {
    write.mockRestore();
  });

  return { write };
}

test('it writes the text to stdout as it is', () => {
  const ctx = setupTest();

  writeStdout('::warning::the kettle is cold\n');

  expect(ctx.write.mock.calls).toStrictEqual([['::warning::the kettle is cold\n']]);
});
