import { rm } from 'node:fs/promises';

export async function removePath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
