import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { ReadSkillFilesManifestOptions } from './read-skill-files-manifest.ts';
import { readSkillFilesManifest } from './read-skill-files-manifest.ts';
import { syncManifestPath } from './sync-manifest-path.ts';

// Whether the manifest at the head of the pin branch is the one the pin step writes for the pin,
// from the commit the branch started at.
export async function probePinManifestChange(
  options: Readonly<ReadSkillFilesManifestOptions>,
  head: string,
  pin: string,
): Promise<boolean> {
  const compared = await runCheckedCommand(
    options.runCommand,
    ['gh', 'api', `repos/${options.repo}/compare/main...${head}`, '--jq', '.merge_base_commit.sha'],
    { cwd: options.cwd, env: options.env },
  );

  const update = await readSkillFilesManifest(options, compared.stdout.trim(), pin);

  const shown = await runCheckedCommand(
    options.runCommand,
    [
      'gh',
      'api',
      `repos/${options.repo}/contents/${syncManifestPath}?ref=${head}`,
      '-H',
      'Accept: application/vnd.github.raw',
    ],
    { cwd: options.cwd, env: options.env },
  );

  return update !== null && update.added.length > 0 && shown.stdout === update.text;
}
