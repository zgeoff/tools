import { pathToFileURL } from 'node:url';
import { isScene } from '../render/define-scene.ts';
import type { Scene } from '../types.ts';
import type { SceneFolder } from './read-scene-folders.ts';

// Loads the scene that the folder's scene.tsx exports by default.
export async function readScene(folder: SceneFolder): Promise<Scene> {
  const loaded: unknown = await import(pathToFileURL(folder.scenePath).href);

  const scene =
    typeof loaded === 'object' && loaded !== null && 'default' in loaded
      ? loaded.default
      : undefined;

  if (!isScene(scene)) {
    throw new Error(
      `scene ${folder.name}: scene.tsx exports no scene by default; call defineScene`,
    );
  }

  return scene;
}
