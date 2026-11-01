import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSkillsPin } from '../scripts/repo-sync/parse-skills-pin.ts';
import { skillsPinPath } from '../scripts/repo-sync/skills-pin-path.ts';
import { pinnedSkillsFolder } from '../scripts/skills/pinned-skills-folder.ts';

// Reads a file of zgeoff/skills, by its path in that repo, at the commit the tools checkout at the
// root pins, from the tree that `bun run skills:install` unpacks.
export async function readPinnedSkillText(root: string, path: string): Promise<string> {
  const pinText = await readFile(join(root, skillsPinPath), 'utf8');

  const pinValue: unknown = JSON.parse(pinText);
  const commit = parseSkillsPin(pinValue);

  if (commit === null) {
    throw new Error(`${skillsPinPath} holds no full commit ID of zgeoff/skills`);
  }

  const file = join(root, pinnedSkillsFolder, commit, path);

  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(
      `${file} is missing; run bun run skills:install to unpack zgeoff/skills at ${commit}`,
      { cause: error },
    );
  }
}
