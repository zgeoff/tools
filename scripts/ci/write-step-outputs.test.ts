import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeStepOutputs } from './write-step-outputs.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-step-outputs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const outputPath = join(directory, 'output');

  return { outputPath };
}

test('it appends one name=value line for each output after the lines already in the file', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.outputPath, 'planned=true\n');
  await writeStepOutputs(ctx.outputPath, { lanes: '["e2e"]', changed: 'false' });

  const text = await readFile(ctx.outputPath, 'utf8');

  expect(text).toBe('planned=true\nlanes=["e2e"]\nchanged=false\n');
});

test('it refuses a value that holds a newline and writes no output', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.outputPath, '');

  const writing = writeStepOutputs(ctx.outputPath, { changed: 'true', body: 'one\ntwo' });

  await expect(writing).rejects.toThrow('the step output body holds a newline');

  const text = await readFile(ctx.outputPath, 'utf8');

  expect(text).toBe('');
});
