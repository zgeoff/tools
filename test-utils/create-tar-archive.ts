import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

export interface ArchiveFile {
  readonly content: string;
  readonly mode: number;
}

// Packs the files into a tar.gz, as a release archive holds them, in a folder under the directory
// that it removes before it returns the bytes.
export async function createTarArchive(
  directory: string,
  files: Readonly<Record<string, ArchiveFile>>,
): Promise<Uint8Array> {
  const folder = await mkdtemp(join(directory, 'archive-'));

  const release = join(folder, 'release');
  const archive = join(folder, 'release.tar.gz');

  await mkdir(release);

  for (const [name, file] of Object.entries(files)) {
    await writeFile(join(release, name), file.content);
    await chmod(join(release, name), file.mode);
  }

  await $`tar -czf ${archive} -C ${release} ${Object.keys(files)}`.quiet();

  const buffer = await readFile(archive);

  const bytes = new Uint8Array(buffer);

  await rm(folder, { recursive: true, force: true });

  return bytes;
}
