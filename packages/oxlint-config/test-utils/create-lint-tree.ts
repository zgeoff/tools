import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type RuleSettings = Readonly<Record<string, unknown>>;

export type FileTree = Readonly<Record<string, string>>;

const rigPackageDir = join(import.meta.dir, '..', '..', 'rig');

export async function createLintTree(files: FileTree, rules: RuleSettings): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'oxlint-config-test-'));

  onTestFinished(() => rm(parent, { recursive: true, force: true }));

  // the plugin parses a rig.config.ts with the @zgeoff/rig that resolves from the repo root, and
  // oxlint lints a node_modules inside the tree, so the link sits in the folder above it
  await mkdir(join(parent, 'node_modules', '@zgeoff'), { recursive: true });
  await symlink(rigPackageDir, join(parent, 'node_modules', '@zgeoff', 'rig'));

  const directory = join(parent, 'repo');
  const config = { jsPlugins: [join(import.meta.dir, '..', 'plugin.js')], rules };

  await mkdir(directory);
  await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(config));

  // the rules find the repo root by the nearest `.git`, and one in a directory above the temp
  // directory would otherwise become the root
  if (!Object.keys(files).some((path) => path === '.git' || path.startsWith('.git/'))) {
    await mkdir(join(directory, '.git'));
  }

  await Promise.all(
    Object.entries(files).map(async ([path, content]: readonly [string, string]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), content);
    }),
  );

  return directory;
}
