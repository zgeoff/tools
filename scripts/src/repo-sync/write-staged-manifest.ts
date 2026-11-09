import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type {
  ReadSkillFilesManifestOptions,
  SkillFilesManifestText,
} from './read-skill-files-manifest.ts';
import { syncManifestPath } from './sync-manifest-path.ts';

// Commits the manifest on the branch through the contents API, so GitHub signs the commit as the
// App, and returns the commit.
export async function writeStagedManifest(
  options: Readonly<ReadSkillFilesManifestOptions>,
  update: Readonly<SkillFilesManifestText>,
  branch: string,
): Promise<string> {
  const written = await runCheckedCommand(
    options.runCommand,
    [
      'gh',
      'api',
      '-X',
      'PUT',
      `repos/${options.repo}/contents/${syncManifestPath}`,
      '-f',
      'message=chore(skills): list the new skill files in the sync manifest',
      '-f',
      `content=${Buffer.from(update.text).toString('base64')}`,
      '-f',
      `sha=${update.sha}`,
      '-f',
      `branch=${branch}`,
      '--jq',
      '.commit.sha',
    ],
    { cwd: options.cwd, env: options.env },
  );

  return written.stdout.trim();
}
