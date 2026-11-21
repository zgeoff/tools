import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readRenderedScene } from './read-rendered-scene.ts';
import { readSceneFolders } from './read-scene-folders.ts';

// Renders every scene of the repo in memory, and writes the files only when every scene renders.
export async function runBuildCommand(repoRoot: string): Promise<string[]> {
  const folders = readSceneFolders(join(repoRoot, 'scripts', 'storyboard'));
  const rendered = [];

  for (const folder of folders) {
    const scene = await readRenderedScene(folder, repoRoot);

    rendered.push(scene);
  }

  const written: string[] = [];

  for (const scene of rendered) {
    await mkdir(dirname(scene.darkPath), { recursive: true });

    await Bun.write(scene.darkPath, scene.dark);
    await Bun.write(scene.lightPath, scene.light);

    written.push(scene.darkPath, scene.lightPath);
  }

  return written;
}
