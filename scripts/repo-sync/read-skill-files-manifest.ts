import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { buildSkillFilesManifest } from './build-skill-files-manifest.ts';
import { parseManifestContents } from './parse-manifest-contents.ts';
import { parseSkillsTree } from './parse-skills-tree.ts';
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

export async function readSkillFilesManifest(
  options: Readonly<ReadSkillFilesManifestOptions>,
  ref: string,
  skillsCommit: string,
): Promise<SkillFilesManifestText | null> {
  const tree = await runCheckedCommand(
    options.runCommand,
    ['gh', 'api', `repos/zgeoff/skills/git/trees/${skillsCommit}?recursive=1`],
    { cwd: options.cwd, env: options.env },
  );

  const shown = await runCheckedCommand(
    options.runCommand,
    ['gh', 'api', `repos/${options.repo}/contents/${syncManifestPath}?ref=${ref}`],
    { cwd: options.cwd, env: options.env },
  );

  const treeValue: unknown = JSON.parse(tree.stdout);
  const shownValue: unknown = JSON.parse(shown.stdout);
  const files = parseSkillsTree(treeValue);
  const contents = parseManifestContents(shownValue);

  if (files === null || contents === null) {
    return null;
  }

  const manifestValue: unknown = JSON.parse(contents.text);
  const built = buildSkillFilesManifest(manifestValue, files);

  return { sha: contents.sha, text: renderManifestText(built.manifest), added: built.added };
}
