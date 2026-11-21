import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface SceneFolder {
  readonly name: string;
  readonly directory: string;
  readonly scenePath: string;
}

// Each subfolder of `storyboardDir` that holds a scene.tsx is a scene, named for its folder.
export function readSceneFolders(storyboardDir: string): SceneFolder[] {
  let entries: string[];

  try {
    entries = readdirSync(storyboardDir).toSorted();
  } catch {
    return [];
  }

  return entries.flatMap((name) => {
    const directory = join(storyboardDir, name);
    const scenePath = join(directory, 'scene.tsx');

    return statSync(directory).isDirectory() && Bun.file(scenePath).size > 0
      ? [{ name, directory, scenePath }]
      : [];
  });
}
