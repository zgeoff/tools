import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type {
  ReadSkillFilesManifestOptions,
  SkillFilesManifestText,
} from './read-skill-files-manifest.ts';
import { readSkillFilesManifest } from './read-skill-files-manifest.ts';
import { syncManifestPath } from './sync-manifest-path.ts';

export interface PinManifestFacts {
  // The manifest at the head of the pin branch.
  readonly headText: string;

  // The manifest the pin step writes for the pin, from the commit the branch started at; null when
  // GitHub gives no whole tree or no manifest content.
  readonly expected: SkillFilesManifestText | null;
}

export async function readPinManifestFacts(
  options: Readonly<ReadSkillFilesManifestOptions>,
  head: string,
  pin: string,
): Promise<PinManifestFacts> {
  const compared = await runCheckedCommand(
    options.runCommand,
    ['gh', 'api', `repos/${options.repo}/compare/main...${head}`, '--jq', '.merge_base_commit.sha'],
    { cwd: options.cwd, env: options.env },
  );

  const expected = await readSkillFilesManifest(options, compared.stdout.trim(), pin);

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

  return { headText: shown.stdout, expected };
}
