import { rm, writeFile } from 'node:fs/promises';

// A stand-in for the lane's test run that replaces the folder with a file, then passes, so the
// lane's later removal of a folder inside it fails with ENOTDIR.
export function makeBlockingTestRun(directory: string): () => Promise<number> {
  return async () => {
    await rm(directory, { recursive: true, force: true });
    await writeFile(directory, 'a file where the folder goes');

    return 0;
  };
}
