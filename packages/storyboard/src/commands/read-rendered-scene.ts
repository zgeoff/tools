import { join } from 'node:path';
import { renderSceneFiles } from '../render/render-scene-files.ts';
import type { SceneFolder } from './read-scene-folders.ts';
import { readScene } from './read-scene.ts';

export interface RenderedScene {
  readonly name: string;
  readonly darkPath: string;
  readonly lightPath: string;
  readonly dark: string;
  readonly light: string;
}

// Renders one scene in memory. A failure names the scene.
export async function readRenderedScene(
  folder: SceneFolder,
  repoRoot: string,
): Promise<RenderedScene> {
  try {
    const scene = await readScene(folder);

    const files = renderSceneFiles(scene, folder.name);

    return {
      name: folder.name,
      darkPath: join(repoRoot, `${scene.out}-dark.svg`),
      lightPath: join(repoRoot, `${scene.out}-light.svg`),
      ...files,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`scene ${folder.name} fails: ${reason}`, { cause: error });
  }
}
