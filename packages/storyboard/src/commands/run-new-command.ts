import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { BROWSER_SUITE, UNIT_SUITE, buildSceneTemplates } from './build-scene-templates.ts';
import { readSceneFolders } from './read-scene-folders.ts';

// Writes the three files of a new scene. On a repo's first scene it also writes the two suites and
// adds the build script to the root package.json, and it returns the steps that remain.
export async function runNewCommand(repoRoot: string, sceneName: string): Promise<string[]> {
  if (!/^[a-z][a-z0-9-]*$/u.test(sceneName)) {
    throw new Error(`"${sceneName}" is no scene name: use lowercase letters, digits and hyphens`);
  }

  const storyboardDir = join(repoRoot, 'scripts', 'storyboard');
  const sceneDirectory = join(storyboardDir, sceneName);

  const hasScene = await Bun.file(join(sceneDirectory, 'scene.tsx')).exists();

  if (hasScene) {
    throw new Error(`scene ${sceneName} exists already`);
  }

  const isFirstScene = readSceneFolders(storyboardDir).length === 0;
  const templates = buildSceneTemplates(sceneName);

  await mkdir(sceneDirectory, { recursive: true });

  await Bun.write(join(sceneDirectory, 'tokens.ts'), templates.tokens);
  await Bun.write(join(sceneDirectory, 'kit.ts'), templates.kit);
  await Bun.write(join(sceneDirectory, 'scene.tsx'), templates.scene);

  if (!isFirstScene) {
    return [];
  }

  await Bun.write(join(storyboardDir, 'storyboard.test.ts'), UNIT_SUITE);
  await Bun.write(join(storyboardDir, 'storyboard.browser.test.ts'), BROWSER_SUITE);

  const packageJSON = await readPackageJSON(repoRoot);

  const updated = {
    ...packageJSON,
    scripts: { ...packageJSON.scripts, storyboard: 'storyboard build' },
  };

  await Bun.write(join(repoRoot, 'package.json'), `${JSON.stringify(updated, null, 2)}\n`);

  return readRemainingSteps(repoRoot, packageJSON.scripts ?? {});
}

const PackageJSON = z.looseObject({ scripts: z.record(z.string(), z.string()).optional() });

async function readPackageJSON(repoRoot: string): Promise<z.infer<typeof PackageJSON>> {
  const file = Bun.file(join(repoRoot, 'package.json'));

  const isPresent = await file.exists();

  if (!isPresent) {
    throw new Error(`${repoRoot} has no package.json`);
  }

  const content: unknown = await file.json();

  return PackageJSON.parse(content);
}

async function readRemainingSteps(
  repoRoot: string,
  scripts: Readonly<Record<string, string>>,
): Promise<string[]> {
  const steps = ['run `bun add -d @zgeoff/storyboard @zgeoff/rig`'];

  if (scripts['test:browser'] === undefined) {
    steps.push(
      'stage the new files with `git add`, then run `bunx rig init`, which adds the browser lane only for a `.browser.test.ts` file that git tracks',
    );
  }

  const tsconfig = Bun.file(join(repoRoot, 'tsconfig.json'));

  const hasTsconfig = await tsconfig.exists();

  const tsconfigText = hasTsconfig ? await tsconfig.text() : '';

  if (!tsconfigText.includes('"jsx"')) {
    steps.push('add `"jsx": "react-jsx"` to your tsconfig, so the type check reads the JSX');
  }

  return steps;
}
