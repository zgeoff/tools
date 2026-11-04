import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import type { SkillsTreeFile } from './build-skill-files-manifest.ts';
import { buildSkillFilesManifest } from './build-skill-files-manifest.ts';
import { renderManifestText } from './render-manifest-text.ts';
import { syncManifestPath } from './sync-manifest-path.ts';

export interface ReadSkillFilesManifestOptions {
  readonly cwd: string;

  // The whole environment of each gh command, with a GH_TOKEN that reads this repo.
  readonly env: Readonly<Record<string, string | undefined>>;

  // The owner and name of this repository.
  readonly repo: string;

  readonly runCommand: RunCommand;
}

export interface SkillFilesManifestText {
  // The blob of the manifest at the commit read, which the contents API needs to replace it.
  readonly sha: string;

  readonly text: string;
  readonly added: readonly string[];
}

// The manifest at the commit of this repo, with the new files of the zgeoff/skills commit added.
export async function readSkillFilesManifest(
  options: Readonly<ReadSkillFilesManifestOptions>,
  ref: string,
  skillsCommit: string,
): Promise<SkillFilesManifestText> {
  // A truncated tree would hide new files, so the read fails rather than miss them.
  const tree = await runCheckedCommand(
    options.runCommand,
    [
      'gh',
      'api',
      `repos/zgeoff/skills/git/trees/${skillsCommit}?recursive=1`,
      '--jq',
      String.raw`if .truncated then error("the tree is truncated") else .tree[] | select(.type == "blob") | "\(.mode) \(.path)" end`,
    ],
    { cwd: options.cwd, env: options.env },
  );

  const shown = await runCheckedCommand(
    options.runCommand,
    [
      'gh',
      'api',
      `repos/${options.repo}/contents/${syncManifestPath}?ref=${ref}`,
      '--jq',
      '.sha, .content',
    ],
    { cwd: options.cwd, env: options.env },
  );

  const [sha = '', ...content] = shown.stdout.split('\n');
  const manifestValue: unknown = JSON.parse(Buffer.from(content.join(''), 'base64').toString());

  const files = tree.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => toSkillsTreeFile(line));

  const built = buildSkillFilesManifest(manifestValue, files);

  return { sha, text: renderManifestText(built.manifest), added: built.added };
}

// A line holds the blob's git mode, a space, then its path, which may hold spaces itself.
function toSkillsTreeFile(line: string): SkillsTreeFile {
  const space = line.indexOf(' ');

  return { mode: line.slice(0, space), path: line.slice(space + 1) };
}
