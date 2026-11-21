import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { readRepoRoot } from '../commands/read-repo-root.ts';
import { readSceneFolders } from '../commands/read-scene-folders.ts';
import { readScene } from '../commands/read-scene.ts';
import { parseViewSize } from './parse-view-size.ts';
import { readFrameProblems } from './read-frame-problems.ts';

// Registers one test for each scene and file: the file's frames, at each 0.25 s of its loop, hold
// no text that overlaps another, no text outside the view box, and the last frame matches the first.
export function describeFrameChecks(storyboardDir: string): void {
  const repoRoot = readRepoRoot(storyboardDir);

  for (const folder of readSceneFolders(storyboardDir)) {
    for (const mode of ['dark', 'light'] as const) {
      test(`scene ${folder.name}: its ${mode} file has no overlapping text, no text outside the view box and a last frame that matches the first`, async () => {
        const scene = await readScene(folder);
        const svg = await Bun.file(join(repoRoot, `${scene.out}-${mode}.svg`)).text();

        const size = parseViewSize(svg);

        const view = new Bun.WebView({ backend: 'chrome', width: size.width, height: size.height });

        onTestFinished(() => {
          view.close();
        });

        const problems = await readFrameProblems(view, svg);

        expect(problems).toStrictEqual({
          overlaps: [],
          outside: [],
          lastFrameDifference: undefined,
        });
      });
    }
  }
}
