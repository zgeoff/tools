import { mock } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// A stand-in that records each call and writes the file with the text into the folder it gets.
export function makeFileWritingStub(fileName: string, text: string) {
  return mock(async (directory: string) => {
    await writeFile(join(directory, fileName), text);
  });
}
