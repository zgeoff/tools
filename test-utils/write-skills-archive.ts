import { join } from 'node:path';
import { runCheckedCommand } from '../scripts/ci/run-checked-command.ts';
import type { RunCommand } from '../scripts/ci/run-command.ts';

export interface SkillsArchiveOptions {
  // The folder the files are laid out in before tar packs them.
  readonly packDirectory: string;

  readonly archivePath: string;
  readonly commit: string;

  // Each file's path inside the repo, with its content.
  readonly files: Readonly<Record<string, string>>;

  // Writes each file under the folder; writeTreeFiles holds the real one.
  readonly writeTree: (directory: string, files: Readonly<Record<string, string>>) => Promise<void>;

  readonly runCommand: RunCommand;

  // The whole environment of tar, which needs PATH to start.
  readonly env: Readonly<Record<string, string | undefined>>;
}

// Packs the files as GitHub's archive of zgeoff/skills at the commit packs them: a gzipped tar
// with every file under one top folder, `skills-<commit>/`.
export async function writeSkillsArchive(options: Readonly<SkillsArchiveOptions>): Promise<void> {
  const top = `skills-${options.commit}`;

  await options.writeTree(join(options.packDirectory, top), options.files);

  await runCheckedCommand(
    options.runCommand,
    ['tar', '-czf', options.archivePath, '-C', options.packDirectory, top],
    { cwd: options.packDirectory, env: options.env },
  );
}
