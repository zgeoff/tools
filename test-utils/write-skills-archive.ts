import { join } from 'node:path';
import { $ } from 'bun';
import { writeTreeFiles } from './write-tree-files.ts';

export interface SkillsArchiveOptions {
  // The folder the files are laid out in before tar packs them.
  readonly packDirectory: string;

  readonly archivePath: string;
  readonly commit: string;

  // Each file's path inside the repo, with its content.
  readonly files: Readonly<Record<string, string>>;
}

// Packs the files as GitHub's archive of zgeoff/skills at the commit packs them: a gzipped tar
// with every file under one top folder, `skills-<commit>/`.
export async function writeSkillsArchive(options: Readonly<SkillsArchiveOptions>): Promise<void> {
  const top = `skills-${options.commit}`;

  await writeTreeFiles(join(options.packDirectory, top), options.files);

  await $`tar -czf ${options.archivePath} -C ${options.packDirectory} ${top}`.quiet();
}
