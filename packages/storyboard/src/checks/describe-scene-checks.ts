import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readRenderedScene } from '../commands/read-rendered-scene.ts';
import { readRepoRoot } from '../commands/read-repo-root.ts';
import { readSceneFolders } from '../commands/read-scene-folders.ts';
import type { SceneFolder } from '../commands/read-scene-folders.ts';
import { MAX_FILE_BYTES, collectSceneProblems } from './collect-scene-problems.ts';
import type { NamedText, SceneRule } from './collect-scene-problems.ts';

const RULES: readonly (readonly [SceneRule, string])[] = [
  ['allow-list', 'its SVG files use only the allowed elements and attributes'],
  ['style', 'its <style> holds no @ rule, no url() and no animation or transition'],
  ['links', 'its SVG files link only to ids in the same file and hold no script'],
  ['size', `its SVG files stay under ${MAX_FILE_BYTES} bytes`],
  ['hex-colour', 'its sources, other than tokens.ts, hold no hex colour'],
  ['stale', 'its committed SVG files match what storyboard build writes'],
];

// Registers one test for each scene and each rule of the unit suite.
export function describeSceneChecks(storyboardDir: string): void {
  const repoRoot = readRepoRoot(storyboardDir);

  for (const folder of readSceneFolders(storyboardDir)) {
    for (const [rule, title] of RULES) {
      test(`scene ${folder.name}: ${title}`, async () => {
        const problems = await readSceneProblems(folder, repoRoot);

        expect(
          problems.filter((problem) => problem.rule === rule).map((problem) => problem.message),
        ).toStrictEqual([]);
      });
    }
  }
}

async function readSceneProblems(folder: SceneFolder, repoRoot: string) {
  const rendered = await readRenderedScene(folder, repoRoot);

  const built: NamedText[] = [
    { path: relative(repoRoot, rendered.darkPath), text: rendered.dark },
    { path: relative(repoRoot, rendered.lightPath), text: rendered.light },
  ];

  const files = await Promise.all(
    built.map(async (file) => {
      const source = Bun.file(join(repoRoot, file.path));

      const isPresent = await source.exists();

      return isPresent ? [{ path: file.path, text: await source.text() }] : [];
    }),
  );

  const sources = await Promise.all(
    listSourcePaths(folder.directory).map(async (path) => ({
      path: relative(repoRoot, path),
      text: await Bun.file(path).text(),
    })),
  );

  return collectSceneProblems({ files: files.flat(), sources, built });
}

function listSourcePaths(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:tsx?|jsx?)$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}
